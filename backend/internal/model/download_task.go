package model

import "time"

// DownloadTask 下载任务模型
type DownloadTask struct {
	ID             int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID         int64     `gorm:"column:user_id;type:bigint;not null;index:idx_user_file" json:"userId"`
	TaskID         string    `gorm:"column:task_id;type:varchar(64);not null;uniqueIndex:uk_task_id" json:"taskId"`
	FileID         int64     `gorm:"column:file_id;type:bigint;not null;index:idx_user_file" json:"fileId"`
	FileName       string    `gorm:"column:file_name;type:varchar(255);not null" json:"fileName"`
	TotalSize      int64     `gorm:"column:total_size;type:bigint;not null;default:0" json:"totalSize"`
	DownloadedSize int64     `gorm:"column:downloaded_size;type:bigint;not null;default:0" json:"downloadedSize"`
	Status         int8      `gorm:"column:status;type:tinyint;not null;default:1" json:"status"`
	FilePath       string    `gorm:"column:file_path;type:varchar(1024);default:''" json:"filePath"`
	CreateTime     time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime     time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (DownloadTask) TableName() string { return "download_task" }

// 下载任务状态常量
const (
	DownloadStatusDownloading = 1 // 下载中
	DownloadStatusCompleted   = 2 // 已完成
	DownloadStatusPaused      = 3 // 已暂停
	DownloadStatusCancelled   = 4 // 已取消
	DownloadStatusFailed      = 5 // 失败
)
