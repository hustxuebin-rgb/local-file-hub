package worker

import (
	"log"
	"time"

	"gorm.io/gorm"
)

// CleanupWorker 清理工作器，负责定时清理过期分享和回收站文件
type CleanupWorker struct{ DB *gorm.DB }

// Start 启动定时清理任务
func (w *CleanupWorker) Start() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			w.cleanExpiredShares()
		}
	}()
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			w.cleanRecycleBin()
		}
	}()
}

func (w *CleanupWorker) cleanExpiredShares() {
	result := w.DB.Exec("UPDATE share_record SET status = 0 WHERE expire_time IS NOT NULL AND expire_time < NOW() AND status = 1")
	if result.Error != nil {
		log.Printf("[CleanupWorker] 清理过期分享失败: %v", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		log.Printf("[CleanupWorker] 已清理 %d 条过期分享", result.RowsAffected)
	}
}

func (w *CleanupWorker) cleanRecycleBin() {
	threshold := time.Now().AddDate(0, 0, -30)
	result := w.DB.Exec("DELETE FROM file_info WHERE is_delete = 1 AND delete_time < ?", threshold)
	if result.Error != nil {
		log.Printf("[CleanupWorker] 清理回收站失败: %v", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		log.Printf("[CleanupWorker] 已清理 %d 条回收站文件", result.RowsAffected)
	}
}
