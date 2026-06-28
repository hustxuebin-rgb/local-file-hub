package service

import (
	"errors"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// DownloadService 下载服务
type DownloadService struct {
	DB               *gorm.DB
	DownloadTaskRepo *repository.DownloadTaskRepo
	FileRepo         *repository.FileRepo
}

// DownloadInitResp 下载初始化响应
type DownloadInitResp struct {
	TaskID      string `json:"taskId"`
	FileName    string `json:"fileName"`
	TotalSize   int64  `json:"totalSize"`
	ContentType string `json:"contentType,omitempty"`
}

// InitDownload 初始化下载任务
func (s *DownloadService) InitDownload(userID int64, fileID int64) (*DownloadInitResp, error) {
	// 校验文件存在且属于该用户
	file, err := s.FileRepo.FindByID(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("文件不存在")
		}
		return nil, err
	}

	if file.UserID != userID {
		return nil, errors.New("无权下载该文件")
	}

	if file.IsDelete == 1 {
		return nil, errors.New("文件已被删除")
	}

	// 检查是否已有进行中的下载任务（复用）
	var existing model.DownloadTask
	result := s.DB.Where("user_id = ? AND file_id = ? AND status = ?",
		userID, fileID, model.DownloadStatusDownloading).First(&existing)
	if result.Error == nil {
		// 已有进行中的任务，直接返回
		return &DownloadInitResp{
			TaskID:      existing.TaskID,
			FileName:    existing.FileName,
			TotalSize:   existing.TotalSize,
			ContentType: fileMimeType(file),
		}, nil
	}

	// 创建新任务
	taskID := generateUUID()
	task := &model.DownloadTask{
		UserID:    userID,
		TaskID:    taskID,
		FileID:    fileID,
		FileName:  file.FileName,
		TotalSize: file.FileSize,
		Status:    model.DownloadStatusDownloading,
	}

	if err := s.DownloadTaskRepo.Create(task); err != nil {
		return nil, err
	}

	return &DownloadInitResp{
		TaskID:      taskID,
		FileName:    file.FileName,
		TotalSize:   file.FileSize,
		ContentType: fileMimeType(file),
	}, nil
}

// GetTask 获取下载任务
func (s *DownloadService) GetTask(taskID string) (*model.DownloadTask, error) {
	return s.DownloadTaskRepo.FindByTaskID(taskID)
}

// UpdateProgress 更新下载进度
func (s *DownloadService) UpdateProgress(taskID string, downloadedSize int64) error {
	return s.DownloadTaskRepo.UpdateProgress(taskID, downloadedSize)
}

// PauseDownload 暂停下载任务
func (s *DownloadService) PauseDownload(taskID string) error {
	_, err := s.DownloadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}
	return s.DownloadTaskRepo.UpdateStatus(taskID, model.DownloadStatusPaused)
}

// CancelDownload 取消下载任务
func (s *DownloadService) CancelDownload(taskID string) error {
	_, err := s.DownloadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}
	return s.DownloadTaskRepo.UpdateStatus(taskID, model.DownloadStatusCancelled)
}

// ResumeDownload 恢复下载任务（将状态从 paused 恢复为 downloading）
func (s *DownloadService) ResumeDownload(taskID string) error {
	task, err := s.DownloadTaskRepo.FindByTaskID(taskID)
	if err != nil {
		return err
	}
	if task.Status != model.DownloadStatusPaused {
		return errors.New("任务未处于暂停状态，无法恢复")
	}
	return s.DownloadTaskRepo.UpdateStatus(taskID, model.DownloadStatusDownloading)
}

// fileMimeType 返回文件的 MIME 类型字符串
func fileMimeType(file *model.FileInfo) string {
	if file.MimeType != nil {
		return *file.MimeType
	}
	return "application/octet-stream"
}

// generateUUID is defined in upload_service.go within the same package, so it's accessible here.

// BatchAction 批量操作下载任务（pause/resume/cancel）
func (s *DownloadService) BatchAction(userID int64, taskIDs []string, action string) error {
	switch action {
	case "pause":
		return s.DownloadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.DownloadStatusPaused)
	case "resume":
		return s.DownloadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.DownloadStatusDownloading)
	case "cancel":
		return s.DownloadTaskRepo.BatchUpdateStatus(userID, taskIDs, model.DownloadStatusCancelled)
	default:
		return errors.New("不支持的操作类型")
	}
}
