package model

import "time"

// UploadTask 上传任务模型
type UploadTask struct {
	ID            int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID        int64      `gorm:"column:user_id;type:bigint;not null;index" json:"userId"`
	TaskID        string     `gorm:"column:task_id;type:varchar(64);not null;uniqueIndex" json:"taskId"`
	FileName      string     `gorm:"column:file_name;type:varchar(255);not null" json:"fileName"`
	MD5           string     `gorm:"column:md5;type:varchar(32);default:''" json:"md5"`
	TotalSize     int64      `gorm:"column:total_size;type:bigint;not null;default:0" json:"totalSize"`
	ChunkSize     int        `gorm:"column:chunk_size;type:int;not null;default:0" json:"chunkSize"`
	TotalChunk    int        `gorm:"column:total_chunk;type:int;not null;default:0" json:"totalChunk"`
	FinishedChunk int        `gorm:"column:finished_chunk;type:int;not null;default:0" json:"finishedChunk"`
	FolderID      int64      `gorm:"column:folder_id;type:bigint;not null;default:0" json:"folderId"`
	Visibility    int8       `gorm:"column:visibility;type:tinyint;not null;default:0" json:"visibility"`
	Status        int8       `gorm:"column:status;type:tinyint;not null;default:1" json:"status"`
	CreateTime    time.Time  `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime    time.Time  `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
	PauseTime     *time.Time `gorm:"column:pause_time" json:"pauseTime"`
	FilePath      string     `gorm:"column:file_path;type:varchar(1024);default:''" json:"filePath"`
}

// TableName 指定表名
func (UploadTask) TableName() string { return "upload_task" }

// 上传任务状态常量
const (
	UploadStatusUploading = 1 // 上传中
	UploadStatusMerging   = 2 // 合并中
	UploadStatusCompleted = 3 // 已完成
	UploadStatusCancelled = 4 // 已取消
	UploadStatusPaused    = 5 // 已暂停
)
