package service

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// 上传任务状态常量
const (
	UploadStatusUploading = 1 // 上传中
	UploadStatusMerging   = 2 // 合并中
	UploadStatusCompleted = 3 // 已完成
	UploadStatusCancelled = 4 // 已取消
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

// InitUploadResp 初始化上传响应
type InitUploadResp struct {
	TaskID    string `json:"taskId"`
	QuickDone bool   `json:"quickDone"`        // 是否秒传完成
	FileID    int64  `json:"fileId,omitempty"` // 秒传时返回文件ID
}

// InitUpload 初始化上传任务，含秒传检测
// 若 fileMD5 非空且系统中已存在相同MD5的文件，则秒传完成
func (s *UploadService) InitUpload(userID int64, fileName string, fileSize int64, fileMD5 string, folderID int64) (*InitUploadResp, error) {
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

	// 计算分块
	chunkSize := 5 * 1024 * 1024 // 默认5MB
	totalChunk := int((fileSize + int64(chunkSize) - 1) / int64(chunkSize))
	if totalChunk == 0 {
		totalChunk = 1
	}

	taskID := generateUUID()
	task := &model.UploadTask{
		UserID:     userID,
		TaskID:     taskID,
		FileName:   fileName,
		TotalSize:  fileSize,
		ChunkSize:  chunkSize,
		TotalChunk: totalChunk,
		FolderID:   folderID,
		Status:     UploadStatusUploading,
	}

	if err := s.UploadTaskRepo.Create(task); err != nil {
		return nil, err
	}

	return &InitUploadResp{TaskID: taskID, QuickDone: false}, nil
}

// CreateChunk 写入单个分块到临时存储
func (s *UploadService) CreateChunk(taskID string, chunkIndex int, data []byte) error {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}
	if task.Status != UploadStatusUploading {
		return errors.New("上传任务状态异常，无法接收分块")
	}

	chunkDir := filepath.Join(s.ChunkDir, taskID)
	if err := os.MkdirAll(chunkDir, 0755); err != nil {
		return err
	}

	chunkPath := filepath.Join(chunkDir, strconv.Itoa(chunkIndex))
	if err := os.WriteFile(chunkPath, data, 0644); err != nil {
		return err
	}

	// 更新进度
	return s.UploadTaskRepo.UpdateChunkProgress(taskID, task.FinishedChunk+1)
}

// MergeChunks 合并所有分块为最终文件，计算MD5
func (s *UploadService) MergeChunks(taskID string) (*model.FileInfo, error) {
	task, err := s.UploadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != UploadStatusUploading {
		return nil, errors.New("上传任务状态异常，无法合并")
	}

	// 标记为合并中
	if err := s.UploadTaskRepo.UpdateStatus(taskID, UploadStatusMerging); err != nil {
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

	saveName := generateUUID()
	ext := filepath.Ext(task.FileName)
	saveName = saveName + ext
	destPath := filepath.Join(userDir, saveName)

	// 合并分块并计算MD5
	chunkDir := filepath.Join(s.ChunkDir, taskID)
	destFile, err := os.Create(destPath)
	if err != nil {
		return nil, err
	}
	defer destFile.Close()

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
		FullPath:   destPath,
		CreateTime: now,
	}

	if err := s.FileRepo.Create(file); err != nil {
		return nil, err
	}

	// 更新用户已用空间
	if err := s.UserRepo.UpdateUsedSize(task.UserID, task.TotalSize); err != nil {
		return nil, err
	}

	// 清理分块临时文件
	os.RemoveAll(chunkDir)

	// 标记完成
	if err := s.UploadTaskRepo.UpdateStatus(taskID, UploadStatusCompleted); err != nil {
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
	return s.UploadTaskRepo.UpdateStatus(taskID, UploadStatusCancelled)
}

// generateUUID 生成UUID格式字符串
func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
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
// 1=文档, 2=图片, 3=视频, 4=音频, 5=其他
func detectFileType(ext string) int8 {
	ext = strings.ToLower(ext)
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico":
		return 2
	case ".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv", ".webm", ".m4v":
		return 3
	case ".mp3", ".wav", ".aac", ".flac", ".ogg", ".wma", ".m4a":
		return 4
	case ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".csv", ".md":
		return 1
	default:
		return 5
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
