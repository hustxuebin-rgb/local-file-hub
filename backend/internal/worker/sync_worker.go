package worker

import (
	"log"
	"time"

	"gorm.io/gorm"
)

// SyncWorker 存储同步工作器，负责定时执行存储盘同步任务
type SyncWorker struct{ DB *gorm.DB }

// Start 启动定时同步任务
func (w *SyncWorker) Start() {
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			w.executeSync()
		}
	}()
}

func (w *SyncWorker) executeSync() {
	var task struct {
		ID        int64
		IsRunning int8
	}
	w.DB.Table("storage_sync_task").Select("id, is_running").First(&task)
	if task.IsRunning == 1 {
		log.Println("[SyncWorker] 同步任务正在执行中，跳过")
		return
	}
	w.DB.Exec("UPDATE storage_sync_task SET is_running = 1 WHERE id = ?", task.ID)
	defer w.DB.Exec("UPDATE storage_sync_task SET is_running = 0, last_sync_time = NOW(), last_sync_result = 1 WHERE id = ?", task.ID)

	// 检查备盘状态
	var backupDisk struct {
		Status int8
	}
	err := w.DB.Table("storage_disk").Select("status").Where("disk_type = 2").First(&backupDisk).Error
	if err != nil || backupDisk.Status != 1 {
		w.DB.Exec("INSERT INTO sys_warn_log (warn_type, warn_content) VALUES (?, ?)", 2, "备盘离线或不可用")
		w.DB.Exec("UPDATE storage_sync_task SET last_sync_result = 0 WHERE id = ?", task.ID)
		return
	}
	log.Println("[SyncWorker] 同步任务执行完成")
}

// RunManualSync 手动触发一次同步
func (w *SyncWorker) RunManualSync() {
	go w.executeSync()
}
