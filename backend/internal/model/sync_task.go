package model

import "time"

// StorageSyncTask 存储同步任务模型
type StorageSyncTask struct {
	ID             int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	SyncMode       int8       `gorm:"column:sync_mode;type:tinyint;not null" json:"syncMode"`
	CronExpr       string     `gorm:"column:cron_expr;type:varchar(50);not null" json:"cronExpr"`
	IgnoreSuffix   string     `gorm:"column:ignore_suffix;type:varchar(500);not null;default:''" json:"ignoreSuffix"`
	SpeedLimit     *int64     `gorm:"column:speed_limit;type:bigint" json:"speedLimit"`
	LastSyncTime   *time.Time `gorm:"column:last_sync_time;type:datetime" json:"lastSyncTime"`
	LastSyncResult *int8      `gorm:"column:last_sync_result;type:tinyint" json:"lastSyncResult"`
	IsRunning      int8       `gorm:"column:is_running;type:tinyint;not null;default:0" json:"isRunning"`
	CreateTime     time.Time  `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime     time.Time  `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (StorageSyncTask) TableName() string { return "storage_sync_task" }
