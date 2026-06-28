package worker

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// TaskCleanupWorker 任务清理工作器，负责定时清理过期的上传和下载任务
type TaskCleanupWorker struct {
	DB               *gorm.DB
	UploadTaskRepo   *repository.UploadTaskRepo
	DownloadTaskRepo *repository.DownloadTaskRepo
	ChunkDir         string
}

// Start 启动定时清理任务（每30分钟执行一次）
func (w *TaskCleanupWorker) Start() {
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			w.cleanExpiredUploadTasks()
			w.cleanExpiredDownloadTasks()
		}
	}()
}

// cleanExpiredUploadTasks 清理过期暂停的上传任务（暂停超过24小时）
func (w *TaskCleanupWorker) cleanExpiredUploadTasks() {
	threshold := time.Now().Add(-24 * time.Hour)
	tasks, err := w.UploadTaskRepo.FindExpiredPausedTasks(threshold)
	if err != nil {
		log.Printf("[TaskCleanupWorker] 查询过期上传任务失败: %v", err)
		return
	}

	for _, task := range tasks {
		// 删除分片目录
		chunkDir := filepath.Join(w.ChunkDir, task.TaskID)
		if err := os.RemoveAll(chunkDir); err != nil {
			log.Printf("[TaskCleanupWorker] 删除分片目录失败 taskID=%s: %v", task.TaskID, err)
		}

		// 更新状态为已取消
		if err := w.UploadTaskRepo.UpdateStatus(task.TaskID, model.UploadStatusCancelled); err != nil {
			log.Printf("[TaskCleanupWorker] 更新上传任务状态失败 taskID=%s: %v", task.TaskID, err)
		}
	}

	if len(tasks) > 0 {
		log.Printf("[TaskCleanupWorker] 已清理 %d 个过期暂停上传任务", len(tasks))
	}
}

// cleanExpiredDownloadTasks 清理过期下载任务（下载中超过1小时未活动）
func (w *TaskCleanupWorker) cleanExpiredDownloadTasks() {
	threshold := time.Now().Add(-1 * time.Hour)
	tasks, err := w.DownloadTaskRepo.FindExpiredTasks(threshold, model.DownloadStatusDownloading)
	if err != nil {
		log.Printf("[TaskCleanupWorker] 查询过期下载任务失败: %v", err)
		return
	}

	for _, task := range tasks {
		if err := w.DownloadTaskRepo.UpdateStatus(task.TaskID, model.DownloadStatusFailed); err != nil {
			log.Printf("[TaskCleanupWorker] 更新下载任务状态失败 taskID=%s: %v", task.TaskID, err)
		}
	}

	if len(tasks) > 0 {
		log.Printf("[TaskCleanupWorker] 已清理 %d 个过期下载任务", len(tasks))
	}
}
