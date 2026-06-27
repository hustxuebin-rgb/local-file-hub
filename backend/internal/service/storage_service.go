package service

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
func (s *StorageService) ListPublicFiles(keyword string, fileType *int8, sortBy, sortOrder string, page, pageSize int) ([]model.FileInfo, int64, error) {
	offset := (page - 1) * pageSize
	return s.FileRepo.FindPublicFiles(keyword, fileType, sortBy, sortOrder, offset, pageSize)
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
