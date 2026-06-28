package model

import "time"

// FileInfo 文件信息模型
type FileInfo struct {
	ID            int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID        int64      `gorm:"column:user_id;type:bigint;not null;index:idx_user_folder" json:"userId"`
	FolderID      int64      `gorm:"column:folder_id;type:bigint;not null;default:0;index:idx_user_folder" json:"folderId"`
	FileName      string     `gorm:"column:file_name;type:varchar(255);not null" json:"fileName"`
	SaveName      string     `gorm:"column:save_name;type:varchar(255);not null" json:"saveName"`
	FileSuffix    string     `gorm:"column:file_suffix;type:varchar(50);not null;default:''" json:"fileSuffix"`
	FileType      int8       `gorm:"column:file_type;type:tinyint;not null" json:"fileType"`
	FileSize      int64      `gorm:"column:file_size;type:bigint;not null;default:0" json:"fileSize"`
	MimeType      *string    `gorm:"column:mime_type;type:varchar(127)" json:"mimeType"`
	MD5           string     `gorm:"column:md5;type:varchar(32);not null;index:idx_md5" json:"md5"`
	TaskID        *string    `gorm:"column:task_id;type:varchar(64);index:idx_task_id" json:"taskId"`
	FullPath      string     `gorm:"column:full_path;type:varchar(500);not null" json:"fullPath"`
	ThumbnailPath *string    `gorm:"column:thumbnail_path;type:varchar(500)" json:"thumbnailPath"`
	PreviewPath   *string    `gorm:"column:preview_path;type:varchar(500)" json:"previewPath"`
	SourceDevice  *int8      `gorm:"column:source_device;type:tinyint" json:"sourceDevice"`
	Visibility    int8       `gorm:"column:visibility;type:tinyint;not null;default:0" json:"visibility"`
	IsDelete      int8       `gorm:"column:is_delete;type:tinyint;not null;default:0" json:"isDelete"`
	DeleteTime    *time.Time `gorm:"column:delete_time;type:datetime" json:"deleteTime"`
	CreateTime    time.Time  `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
}

// TableName 指定表名
func (FileInfo) TableName() string { return "file_info" }
