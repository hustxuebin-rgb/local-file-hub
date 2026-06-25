package model

import "time"

// Folder 文件夹模型
type Folder struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID     int64     `gorm:"column:user_id;type:bigint;not null;index:idx_user_parent" json:"userId"`
	ParentID   int64     `gorm:"column:parent_id;type:bigint;not null;default:0;index:idx_user_parent;uniqueIndex:uk_user_parent_name" json:"parentId"`
	FolderName string    `gorm:"column:folder_name;type:varchar(100);not null;uniqueIndex:uk_user_parent_name" json:"folderName"`
	FullPath   string    `gorm:"column:full_path;type:varchar(500);not null" json:"fullPath"`
	IsPublic   *int8     `gorm:"column:is_public;type:tinyint" json:"isPublic"`
	Sort       int       `gorm:"column:sort;type:int;not null;default:0" json:"sort"`
	CreateTime time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime time.Time `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (Folder) TableName() string { return "folder" }
