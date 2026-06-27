package model

import "time"

// StorageDisk 存储盘模型
type StorageDisk struct {
	ID            int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	DiskType      int8      `gorm:"column:disk_type;type:tinyint;not null;uniqueIndex" json:"diskType"`
	DiskPath      string    `gorm:"column:disk_path;type:varchar(500);not null" json:"diskPath"`
	TotalSize     int64     `gorm:"column:total_size;type:bigint;not null;default:0" json:"totalSize"`
	UsedSize      int64     `gorm:"column:used_size;type:bigint;not null;default:0" json:"usedSize"`
	AvailableSize int64     `gorm:"column:available_size;type:bigint;not null;default:0" json:"availableSize"`
	Status        int8      `gorm:"column:status;type:tinyint;not null;default:1" json:"status"`
	Remark        string    `gorm:"column:remark;type:varchar(200);default:''" json:"remark"`
	CreateTime    time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime    time.Time `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// MountInfo 系统挂载点信息
type MountInfo struct {
	MountPoint string `json:"mountPoint"`
	Device     string `json:"device"`
	FsType     string `json:"fsType"`
}

// DirEntry 目录条目
type DirEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// DiskSimple 磁盘简要信息
type DiskSimple struct {
	ID       int64  `json:"id"`
	DiskPath string `json:"diskPath"`
	DiskType int8   `json:"diskType"`
}

// TableName 指定表名
func (StorageDisk) TableName() string { return "storage_disk" }
