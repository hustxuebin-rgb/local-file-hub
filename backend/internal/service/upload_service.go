package service

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// UploadService 上传服务
type UploadService struct {
	DB             *gorm.DB
	UploadTaskRepo *repository.UploadTaskRepo
	FileRepo       *repository.FileRepo
	UserRepo       *repository.UserRepo
	StorageService *StorageService
	ChunkDir       string // 分块临时存储目录
	MaxFileSize    int64  // 最大文件大小
}

// GetTask 获取上传任务（用于归属权校验）
func (s *UploadService) GetTask(taskID string) (*model.UploadTask, error) {
	return s.UploadTaskRepo.FindByTaskID(taskID)
}

// InitUploadResp 初始化上传响应
type InitUploadResp struct {
	TaskID         string `json:"taskId"`
	QuickDone      bool   `json:"quickDone"`                // 是否秒传完成
	FileID         int64  `json:"fileId,omitempty"`         // 秒传时返回文件ID
	ChunkSize      int    `json:"chunkSize,omitempty"`      // 分片大小（非秒传时）
	TotalChunks    int    `json:"totalChunks,omitempty"`    // 总分片数（非秒传时）
	ConflictExists bool   `json:"conflictExists"`           // 目标文件夹下存在同名文件
	ConflictFileID int64  `json:"conflictFileId,omitempty"` // 冲突文件ID
}

// UploadStatusResp 上传状态响应
type UploadStatusResp struct {
	TaskID         string  `json:"taskId"`
	FileName       string  `json:"fileName"`
	TotalSize      int64   `json:"totalSize"`
	ChunkSize      int     `json:"chunkSize"`
	TotalChunks    int     `json:"totalChunks"`
	FinishedChunks []int   `json:"finishedChunks"`
	FinishedCount  int     `json:"finishedCount"`
	Status         int8    `json:"status"`
	Progress       float64 `json:"progress"`
}

// UploadResumeResp 上传恢复响应
type UploadResumeResp struct {
	TaskID         string `json:"taskId"`
	FileName       string `json:"fileName"`
	TotalSize      int64  `json:"totalSize"`
	ChunkSize      int    `json:"chunkSize"`
	TotalChunks    int    `json:"totalChunks"`
	FinishedChunks []int  `json:"finishedChunks"`
	FinishedCount  int    `json:"finishedCount"`
}

// InitUpload 初始化上传任务，含秒传检测
// 若 fileMD5 非空且系统中已存在相同MD5的文件，则秒传完成
func (s *UploadService) InitUpload(userID int64, fileName string, fileSize int64, fileMD5 string, filePath string, folderID int64, visibility int8) (*InitUploadResp, error) {
	// 检查空间
	if err := s.StorageService.CheckSpace(userID, fileSize); err != nil {
		return nil, err
	}

	// 秒传检测：相同MD5文件已存在
	if fileMD5 != "" {
		existing, err := s.FileRepo.FindByMD5(fileMD5)
		if err == nil && existing != nil {
			// 为该用户复制一份文件记录（引用同一物理文件）
			user, err := s.UserRepo.FindByID(userID)
			if err != nil {
				return nil, err
			}
			disk, err := s.StorageService.GetActiveDisk()
			if err != nil {
				return nil, err
			}

			newFile := *existing
			newFile.ID = 0
			newFile.UserID = userID
			newFile.FolderID = folderID
			newFile.FileName = fileName
			newFile.SaveName = existing.SaveName
			newFile.FullPath = filepath.Join(disk.DiskPath, user.StorageRoot, existing.SaveName)
			newFile.Visibility = visibility
			newFile.CreateTime = time.Now()

			if err := s.FileRepo.Create(&newFile); err != nil {
				return nil, err
			}

			// 更新用户已用空间
			if err := s.UserRepo.UpdateUsedSize(userID, existing.FileSize); err != nil {
				return nil, err
			}

			return &InitUploadResp{TaskID: "", QuickDone: true, FileID: newFile.ID}, nil
		}
	}

	// 重名检测：查询目标文件夹下是否有同名文件
	var conflictFileID int64
	if existing, err := s.FileRepo.FindByNameInFolder(userID, folderID, fileName); err == nil && existing != nil {
		conflictFileID = existing.ID
	}

	// 计算分块（分片大小策略）
	chunkSize, totalChunk := calcChunkStrategy(fileSize)

	taskID := generateUUID()
	task := &model.UploadTask{
		UserID:     userID,
		TaskID:     taskID,
		FileName:   fileName,
		MD5:        fileMD5,
		TotalSize:  fileSize,
		ChunkSize:  chunkSize,
		TotalChunk: totalChunk,
		FolderID:   folderID,
		Visibility: visibility,
		Status:     model.UploadStatusUploading,
		FilePath:   filePath,
	}

	if err := s.UploadTaskRepo.Create(task); err != nil {
		return nil, err
	}

	return &InitUploadResp{
		TaskID:         taskID,
		QuickDone:      false,
		ChunkSize:      chunkSize,
		TotalChunks:    totalChunk,
		ConflictExists: conflictFileID > 0,
		ConflictFileID: conflictFileID,
	}, nil
}

// calcChunkStrategy 根据文件大小计算分片策略
func calcChunkStrategy(fileSize int64) (chunkSize int, totalChunks int) {
	switch {
	case fileSize < 10*1024*1024: // < 10MB 不分片
		chunkSize = int(fileSize)
	case fileSize < 100*1024*1024: // 10-100MB → 2MB
		chunkSize = 2 * 1024 * 1024
	case fileSize < 1024*1024*1024: // 100MB-1GB → 5MB
		chunkSize = 5 * 1024 * 1024
	default: // > 1GB → 10MB
		chunkSize = 10 * 1024 * 1024
	}

	totalChunks = int((fileSize + int64(chunkSize) - 1) / int64(chunkSize))
	if totalChunks == 0 {
		totalChunks = 1
	}
	return
}

// CreateChunk 写入单个分块到临时存储（幂等操作）
func (s *UploadService) CreateChunk(taskID string, chunkIndex int, data []byte) error {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}
	if task.Status != model.UploadStatusUploading && task.Status != model.UploadStatusPaused {
		return errors.New("上传任务状态异常，无法接收分块")
	}

	chunkDir := filepath.Join(s.ChunkDir, taskID)
	if err := os.MkdirAll(chunkDir, 0755); err != nil {
		return err
	}

	chunkPath := filepath.Join(chunkDir, strconv.Itoa(chunkIndex))

	// 幂等检查：分片已存在则跳过
	if _, err := os.Stat(chunkPath); err == nil {
		return nil
	}

	if err := os.WriteFile(chunkPath, data, 0644); err != nil {
		return err
	}

	// 进度更新：扫描目录获取实际分片数量（而非简单 +1）
	entries, err := os.ReadDir(chunkDir)
	if err != nil {
		return err
	}
	return s.UploadTaskRepo.UpdateChunkProgress(taskID, len(entries))
}

// MergeChunks 合并所有分块为最终文件，计算MD5
// overwriteFileID > 0 时，新文件创建成功后删除旧文件
func (s *UploadService) MergeChunks(taskID string, overwriteFileID int64) (*model.FileInfo, error) {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != model.UploadStatusUploading && task.Status != model.UploadStatusPaused {
		return nil, errors.New("上传任务状态异常，无法合并")
	}

	// 标记为合并中
	if err := s.UploadTaskRepo.UpdateStatus(taskID, model.UploadStatusMerging); err != nil {
		return nil, err
	}

	// 构建目标路径
	user, err := s.UserRepo.FindByID(task.UserID)
	if err != nil {
		return nil, err
	}
	disk, err := s.StorageService.GetActiveDisk()
	if err != nil {
		return nil, err
	}

	userDir := filepath.Join(disk.DiskPath, user.StorageRoot)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return nil, err
	}

	saveName := task.FileName
	ext := filepath.Ext(saveName)
	originalBase := strings.TrimSuffix(saveName, ext)
	destPath := filepath.Join(userDir, saveName)

	// 重名检测：非覆盖模式时追加 (1) (2) 等后缀避免覆盖
	if overwriteFileID == 0 {
		for counter := 1; ; counter++ {
			if _, err := os.Stat(destPath); os.IsNotExist(err) {
				break
			}
			saveName = fmt.Sprintf("%s(%d)%s", originalBase, counter, ext)
			destPath = filepath.Join(userDir, saveName)
		}
	}

	// 合并分块并计算MD5
	chunkDir := filepath.Join(s.ChunkDir, taskID)
	destFile, err := os.Create(destPath)
	if err != nil {
		return nil, err
	}
	defer destFile.Close()

	// 合并失败时清理残留文件
	mergeOk := false
	defer func() {
		if !mergeOk {
			os.Remove(destPath)
		}
	}()

	hash := md5.New()
	for i := 0; i < task.TotalChunk; i++ {
		chunkPath := filepath.Join(chunkDir, strconv.Itoa(i))
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			return nil, fmt.Errorf("读取分块 %d 失败: %w", i, err)
		}
		if _, err := destFile.Write(chunkData); err != nil {
			return nil, err
		}
		hash.Write(chunkData)
	}

	md5Hash := hex.EncodeToString(hash.Sum(nil))

	// 检测文件类型和MIME
	fileType := detectFileType(ext)
	mimeType := getMimeTypeByExt(ext)

	now := time.Now()
	file := &model.FileInfo{
		UserID:     task.UserID,
		FolderID:   task.FolderID,
		FileName:   task.FileName,
		SaveName:   saveName,
		FileSuffix: ext,
		FileType:   fileType,
		FileSize:   task.TotalSize,
		MimeType:   &mimeType,
		MD5:        md5Hash,
		TaskID:     &task.TaskID,
		FullPath:   destPath,
		Visibility: task.Visibility,
		CreateTime: now,
	}

	if err := s.FileRepo.Create(file); err != nil {
		return nil, err
	}

	// 更新用户已用空间
	if err := s.UserRepo.UpdateUsedSize(task.UserID, task.TotalSize); err != nil {
		return nil, err
	}

	// 覆盖模式：新文件创建成功后删除旧文件
	if overwriteFileID > 0 {
		oldFile, err := s.FileRepo.FindByID(overwriteFileID)
		if err == nil && oldFile.UserID == task.UserID {
			if err := os.Remove(oldFile.FullPath); err != nil && !os.IsNotExist(err) {
				log.Printf("merge overwrite: remove old file failed: %v", err)
			}
			if err := s.FileRepo.HardDelete(overwriteFileID); err != nil {
				log.Printf("merge overwrite: hard delete failed: %v", err)
			}
			if err := s.UserRepo.UpdateUsedSize(task.UserID, -oldFile.FileSize); err != nil {
				log.Printf("merge overwrite: update used size failed: %v", err)
			}
		}
	}

	mergeOk = true

	// 清理分块临时文件
	os.RemoveAll(chunkDir)

	// 标记完成
	if err := s.UploadTaskRepo.UpdateStatus(taskID, model.UploadStatusCompleted); err != nil {
		return nil, err
	}

	return file, nil
}

// CancelUpload 取消上传任务，清理临时分块
func (s *UploadService) CancelUpload(taskID string) error {
	_, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}

	// 清理分块临时文件
	chunkDir := filepath.Join(s.ChunkDir, taskID)
	os.RemoveAll(chunkDir)

	// 更新状态为已取消
	return s.UploadTaskRepo.UpdateStatus(taskID, model.UploadStatusCancelled)
}

// GetUploadStatus 查询上传状态（扫描分片目录返回已完成分片列表）
func (s *UploadService) GetUploadStatus(taskID string) (*UploadStatusResp, error) {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return nil, err
	}

	finishedChunks, finishedCount := scanFinishedChunks(s.ChunkDir, taskID)

	progress := float64(0)
	if task.TotalChunk > 0 {
		progress = float64(finishedCount) / float64(task.TotalChunk) * 100
	}

	return &UploadStatusResp{
		TaskID:         task.TaskID,
		FileName:       task.FileName,
		TotalSize:      task.TotalSize,
		ChunkSize:      task.ChunkSize,
		TotalChunks:    task.TotalChunk,
		FinishedChunks: finishedChunks,
		FinishedCount:  finishedCount,
		Status:         task.Status,
		Progress:       progress,
	}, nil
}

// PauseUpload 暂停上传任务
func (s *UploadService) PauseUpload(taskID string) error {
	_, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}

	return s.UploadTaskRepo.UpdatePauseTime(taskID, time.Now())
}

// ResumeUpload 恢复上传任务（返回已完成分片列表）
func (s *UploadService) ResumeUpload(taskID string) (*UploadResumeResp, error) {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return nil, err
	}

	if task.Status != model.UploadStatusPaused {
		return nil, errors.New("任务未处于暂停状态，无法恢复")
	}

	// 恢复为上传中
	if err := s.UploadTaskRepo.UpdateStatus(taskID, model.UploadStatusUploading); err != nil {
		return nil, err
	}

	finishedChunks, finishedCount := scanFinishedChunks(s.ChunkDir, taskID)

	return &UploadResumeResp{
		TaskID:         task.TaskID,
		FileName:       task.FileName,
		TotalSize:      task.TotalSize,
		ChunkSize:      task.ChunkSize,
		TotalChunks:    task.TotalChunk,
		FinishedChunks: finishedChunks,
		FinishedCount:  finishedCount,
	}, nil
}

// GetUnfinishedTasks 获取用户所有未完成的上传任务
func (s *UploadService) GetUnfinishedTasks(userID int64) ([]*model.UploadTask, error) {
	return s.UploadTaskRepo.FindByUserAndStatus(userID, []int8{
		model.UploadStatusUploading,
		model.UploadStatusPaused,
	})
}

// BatchAction 批量操作上传任务（pause/resume/cancel）
func (s *UploadService) BatchAction(userID int64, taskIDs []string, action string) error {
	switch action {
	case "pause":
		return s.UploadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.UploadStatusPaused)
	case "resume":
		return s.UploadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.UploadStatusUploading)
	case "cancel":
		return s.UploadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.UploadStatusCancelled)
	default:
		return errors.New("不支持的操作类型")
	}
}

// scanFinishedChunks 扫描分片目录返回已完成的分片索引列表和数量
func scanFinishedChunks(chunkDir, taskID string) ([]int, int) {
	dir := filepath.Join(chunkDir, taskID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []int{}, 0
	}

	finishedChunks := make([]int, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		// 分片文件名是数字字符串
		idx, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}
		finishedChunks = append(finishedChunks, idx)
	}

	sort.Ints(finishedChunks)
	return finishedChunks, len(finishedChunks)
}

// generateUUID 生成UUID格式字符串
func generateUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// 熵源不足时降级：时间戳高8字节 + 进程ID低8字节
		binary.BigEndian.PutUint64(b[0:8], uint64(time.Now().UnixNano()))
		binary.BigEndian.PutUint64(b[8:16], uint64(os.Getpid()))
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// computeMD5 计算文件的MD5哈希值
func computeMD5(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// detectFileType 根据扩展名检测文件类型
// 1=图片, 2=视频, 3=音频, 4=文档, 5=其他（与数据库 file_type 定义一致）
func detectFileType(ext string) int8 {
	ext = strings.ToLower(ext)
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico":
		return 1 // 图片
	case ".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv", ".webm", ".m4v":
		return 2 // 视频
	case ".mp3", ".wav", ".aac", ".flac", ".ogg", ".wma", ".m4a":
		return 3 // 音频
	case ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".csv", ".md":
		return 4 // 文档
	default:
		return 5 // 其他
	}
}

// getMimeTypeByExt 根据扩展名返回MIME类型
func getMimeTypeByExt(ext string) string {
	ext = strings.ToLower(ext)
	mimeTypes := map[string]string{
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".gif":  "image/gif",
		".bmp":  "image/bmp",
		".webp": "image/webp",
		".svg":  "image/svg+xml",
		".ico":  "image/x-icon",
		".mp4":  "video/mp4",
		".avi":  "video/x-msvideo",
		".mov":  "video/quicktime",
		".mkv":  "video/x-matroska",
		".webm": "video/webm",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".aac":  "audio/aac",
		".flac": "audio/flac",
		".ogg":  "audio/ogg",
		".pdf":  "application/pdf",
		".doc":  "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xls":  "application/vnd.ms-excel",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".ppt":  "application/vnd.ms-powerpoint",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		".txt":  "text/plain",
		".csv":  "text/csv",
		".md":   "text/markdown",
		".zip":  "application/zip",
		".rar":  "application/x-rar-compressed",
		".7z":   "application/x-7z-compressed",
	}
	if mime, ok := mimeTypes[ext]; ok {
		return mime
	}
	return "application/octet-stream"
}
