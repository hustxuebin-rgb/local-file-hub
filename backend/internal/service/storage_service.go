package service

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// StorageService 存储服务
type StorageService struct {
	DB         *gorm.DB
	UserRepo   *repository.UserRepo
	FolderRepo *repository.FolderRepo
	FileRepo   *repository.FileRepo
}

// DiskInfo 存储盘信息
type DiskInfo struct {
	TotalSize     int64  `json:"totalSize"`
	UsedSize      int64  `json:"usedSize"`
	AvailableSize int64  `json:"availableSize"`
	DiskPath      string `json:"diskPath"`
	DiskType      int8   `json:"diskType"`
	Status        int8   `json:"status"`
}

// UserQuotaInfo 用户配额信息
type UserQuotaInfo struct {
	UserID       int64  `json:"userId"`
	StorageQuota int64  `json:"storageQuota"`
	UsedSize     int64  `json:"usedSize"`
	Remaining    int64  `json:"remaining"`
	StorageRoot  string `json:"storageRoot"`
}

var (
	ErrInsufficientSpace = errors.New("存储空间不足")
	ErrDiskUnavailable   = errors.New("存储盘不可用")
	ErrFileNotFound      = errors.New("文件不存在")
)

// GetDiskList 获取所有存储盘列表
func (s *StorageService) GetDiskList() ([]DiskInfo, error) {
	var disks []model.StorageDisk
	if err := s.DB.Find(&disks).Error; err != nil {
		return nil, err
	}

	result := make([]DiskInfo, 0, len(disks))
	for _, d := range disks {
		result = append(result, DiskInfo{
			TotalSize:     d.TotalSize,
			UsedSize:      d.UsedSize,
			AvailableSize: d.AvailableSize,
			DiskPath:      d.DiskPath,
			DiskType:      d.DiskType,
			Status:        d.Status,
		})
	}
	return result, nil
}

// GetUserQuota 获取用户存储配额
func (s *StorageService) GetUserQuota(userID int64) (*UserQuotaInfo, error) {
	user, err := s.UserRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}

	remaining := user.StorageQuota - user.UsedSize
	if remaining < 0 {
		remaining = 0
	}

	return &UserQuotaInfo{
		UserID:       user.ID,
		StorageQuota: user.StorageQuota,
		UsedSize:     user.UsedSize,
		Remaining:    remaining,
		StorageRoot:  user.StorageRoot,
	}, nil
}

// CheckSpace 检查用户是否有足够空间
func (s *StorageService) CheckSpace(userID int64, requiredSize int64) error {
	user, err := s.UserRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user.UsedSize+requiredSize > user.StorageQuota {
		return fmt.Errorf("%w: 需要 %d 字节，剩余 %d 字节", ErrInsufficientSpace, requiredSize, user.StorageQuota-user.UsedSize)
	}
	return nil
}

// GetActiveDisk 获取状态正常的存储盘
func (s *StorageService) GetActiveDisk() (*model.StorageDisk, error) {
	var disk model.StorageDisk
	err := s.DB.Where("status = ?", 1).First(&disk).Error
	if err != nil {
		return nil, ErrDiskUnavailable
	}
	return &disk, nil
}

// BuildUserPath 构建用户文件存储路径
func (s *StorageService) BuildUserPath(userID int64, subPath string) (string, error) {
	user, err := s.UserRepo.FindByID(userID)
	if err != nil {
		return "", err
	}

	disk, err := s.GetActiveDisk()
	if err != nil {
		return "", err
	}

	fullPath := filepath.Join(disk.DiskPath, user.StorageRoot, subPath)
	return fullPath, nil
}

// EnsureDir 确保目录存在
func (s *StorageService) EnsureDir(path string) error {
	return os.MkdirAll(path, 0755)
}

// ==================== 文件操作方法 ====================

// UploadFile 上传文件（将已有物理文件注册为文件记录）
func (s *StorageService) UploadFile(userID int64, srcPath, fileName string, folderID int64, fileSize int64, md5Hash string, fileType int8, mimeType string) (*model.FileInfo, error) {
	user, err := s.UserRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}

	disk, err := s.GetActiveDisk()
	if err != nil {
		return nil, err
	}

	userDir := filepath.Join(disk.DiskPath, user.StorageRoot)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return nil, err
	}

	ext := filepath.Ext(fileName)
	saveName := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), fileName, ext)
	destPath := filepath.Join(userDir, saveName)

	if err := copyFile(srcPath, destPath); err != nil {
		return nil, fmt.Errorf("复制文件失败: %w", err)
	}

	now := time.Now()
	file := &model.FileInfo{
		UserID:     userID,
		FolderID:   folderID,
		FileName:   fileName,
		SaveName:   saveName,
		FileSuffix: ext,
		FileType:   fileType,
		FileSize:   fileSize,
		MimeType:   &mimeType,
		MD5:        md5Hash,
		FullPath:   destPath,
		CreateTime: now,
	}

	if err := s.FileRepo.Create(file); err != nil {
		return nil, err
	}

	if err := s.UserRepo.UpdateUsedSize(userID, fileSize); err != nil {
		return nil, err
	}

	return file, nil
}

// ListFiles 列出用户指定目录下的文件（分页，支持关键字/类型/排序过滤）
func (s *StorageService) ListFiles(userID, folderID int64, visibility *int8, keyword string, fileType *int8, sortBy, sortOrder string, page, pageSize int) ([]model.FileInfo, int64, error) {
	offset := (page - 1) * pageSize
	return s.FileRepo.FindByUserAndFolder(userID, folderID, visibility, keyword, fileType, sortBy, sortOrder, offset, pageSize)
}

// GetFileInfo 获取文件信息
func (s *StorageService) GetFileInfo(fileID, userID int64) (*model.FileInfo, error) {
	file, err := s.FileRepo.FindByID(fileID)
	if err != nil {
		return nil, ErrFileNotFound
	}
	if file.UserID != userID {
		return nil, ErrFileNotFound
	}
	return file, nil
}

// DownloadFile 获取文件下载路径
func (s *StorageService) DownloadFile(fileID, userID int64) (string, string, error) {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return "", "", err
	}
	if file.IsDelete == 1 {
		return "", "", ErrFileNotFound
	}
	return file.FullPath, file.FileName, nil
}

// PreviewFile 获取预览文件路径
func (s *StorageService) PreviewFile(fileID, userID int64) (string, string, error) {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return "", "", err
	}
	if file.IsDelete == 1 {
		return "", "", ErrFileNotFound
	}

	previewPath := file.FullPath
	if file.PreviewPath != nil && *file.PreviewPath != "" {
		previewPath = *file.PreviewPath
	}

	mimeType := "application/octet-stream"
	if file.MimeType != nil {
		mimeType = *file.MimeType
	}

	return previewPath, mimeType, nil
}

// SoftDeleteFile 软删除文件（移入回收站）
func (s *StorageService) SoftDeleteFile(fileID, userID int64) error {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return err
	}
	if file.IsDelete == 1 {
		return errors.New("文件已在回收站中")
	}

	if err := s.FileRepo.SoftDelete(fileID); err != nil {
		return err
	}

	return s.UserRepo.UpdateUsedSize(userID, -file.FileSize)
}

// MoveFile 移动文件到目标文件夹
func (s *StorageService) MoveFile(fileID, targetFolderID, userID int64) error {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return err
	}
	if file.IsDelete == 1 {
		return errors.New("文件在回收站中，无法移动")
	}

	file.FolderID = targetFolderID
	return s.FileRepo.Update(file)
}

// RecoverFile 从回收站恢复文件
func (s *StorageService) RecoverFile(fileID, userID int64) error {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return err
	}
	if file.IsDelete == 0 {
		return errors.New("文件不在回收站中")
	}

	if err := s.FileRepo.Recover(fileID); err != nil {
		return err
	}

	return s.UserRepo.UpdateUsedSize(userID, file.FileSize)
}

// HardDeleteFile 物理删除文件记录（不删除物理文件，保留磁盘数据）
func (s *StorageService) HardDeleteFile(fileID, userID int64) error {
	file, err := s.GetFileInfo(fileID, userID)
	if err != nil {
		return err
	}
	if file.IsDelete == 0 {
		return errors.New("请先将文件移入回收站")
	}

	return s.FileRepo.HardDelete(fileID)
}

// ListPublicFiles 列出所有用户公开的文件（分页，支持过滤和排序）
func (s *StorageService) ListPublicFiles(folderID int64, keyword string, fileType *int8, sortBy, sortOrder string, page, pageSize int) ([]model.FileInfo, int64, error) {
	offset := (page - 1) * pageSize
	return s.FileRepo.FindPublicFiles(folderID, keyword, fileType, sortBy, sortOrder, offset, pageSize)
}

// copyFile 复制文件
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

// ==================== 文件夹 ZIP 下载 ====================

// skipFiles 定义 ZIP 打包时需要过滤的文件名集合
var skipFiles = map[string]bool{
	".DS_Store": true,
	"__MACOSX":  true,
	"Thumbs.db": true,
}

// shouldSkipFile 判断文件是否应被过滤：隐藏文件、系统文件、临时文件
func shouldSkipFile(fileName string) bool {
	base := filepath.Base(fileName)
	if strings.HasPrefix(base, ".") {
		return true
	}
	if skipFiles[base] {
		return true
	}
	if strings.HasSuffix(strings.ToLower(base), ".tmp") {
		return true
	}
	return false
}

// collectDescendantFolders 递归收集指定父目录下的所有子孙文件夹
func (s *StorageService) collectDescendantFolders(userID, parentID int64) ([]model.Folder, error) {
	children, err := s.FolderRepo.FindByUserAndParent(userID, parentID)
	if err != nil {
		return nil, err
	}

	var result []model.Folder
	for _, child := range children {
		result = append(result, child)
		descendants, err := s.collectDescendantFolders(userID, child.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, descendants...)
	}
	return result, nil
}

// ZipFolder 递归收集文件夹下所有文件，过滤后打包为 ZIP，返回临时文件路径
func (s *StorageService) ZipFolder(folderID int64, userID int64) (zipPath string, err error) {
	folder, err := s.FolderRepo.FindByID(folderID)
	if err != nil {
		return "", fmt.Errorf("文件夹不存在: %w", err)
	}
	if folder.UserID != userID {
		return "", ErrFileNotFound
	}

	// 收集所有子孙文件夹
	descendants, err := s.collectDescendantFolders(userID, folderID)
	if err != nil {
		return "", fmt.Errorf("收集子文件夹失败: %w", err)
	}

	// 构建完整文件夹列表（根 + 子孙）
	allFolders := make([]model.Folder, 0, 1+len(descendants))
	allFolders = append(allFolders, *folder)
	allFolders = append(allFolders, descendants...)

	// 构建 folderID → ZIP 内相对路径 映射
	folderPathMap := make(map[int64]string, len(allFolders))
	folderPathMap[folderID] = folder.FolderName

	for _, f := range allFolders {
		if f.ID == folderID {
			continue
		}
		parentPath, ok := folderPathMap[f.ParentID]
		if !ok {
			folderPathMap[f.ID] = f.FolderName
		} else {
			folderPathMap[f.ID] = parentPath + "/" + f.FolderName
		}
	}

	// 创建临时 ZIP 文件
	tmpFile, err := os.CreateTemp("", "folder-zip-*.zip")
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}

	zipWriter := zip.NewWriter(tmpFile)
	cleanup := func() {
		zipWriter.Close()
		tmpFile.Close()
		os.Remove(tmpFile.Name())
	}

	// 遍历所有文件夹，将文件写入 ZIP
	for _, f := range allFolders {
		files, ferr := s.FileRepo.FindAllInFolder(userID, f.ID)
		if ferr != nil {
			cleanup()
			return "", fmt.Errorf("查询文件夹内文件失败: %w", ferr)
		}

		folderPrefix := folderPathMap[f.ID]

		for _, file := range files {
			if shouldSkipFile(file.FileName) {
				continue
			}

			zipEntryPath := folderPrefix + "/" + file.FileName
			header := &zip.FileHeader{
				Name:   zipEntryPath,
				Method: zip.Deflate,
			}
			header.SetModTime(file.CreateTime)

			writer, werr := zipWriter.CreateHeader(header)
			if werr != nil {
				cleanup()
				return "", fmt.Errorf("创建 ZIP 条目失败: %w", werr)
			}

			src, serr := os.Open(file.FullPath)
			if serr != nil {
				cleanup()
				return "", fmt.Errorf("打开文件失败 %s: %w", file.FullPath, serr)
			}

			_, cerr := io.Copy(writer, src)
			src.Close()
			if cerr != nil {
				cleanup()
				return "", fmt.Errorf("写入 ZIP 失败: %w", cerr)
			}
		}
	}

	// 先关闭 zipWriter 再关闭 tmpFile，确保所有数据写入
	if err := zipWriter.Close(); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("关闭 ZIP 写入器失败: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("关闭临时文件失败: %w", err)
	}

	return tmpFile.Name(), nil
}
