package model

import "time"

// SysWarnLog 告警日志模型
type SysWarnLog struct {
	ID          int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	WarnType    int8      `gorm:"column:warn_type;type:tinyint;not null;index:idx_warn_type" json:"warnType"`
	WarnContent string    `gorm:"column:warn_content;type:varchar(500);not null;default:''" json:"warnContent"`
	IsRead      int8      `gorm:"column:is_read;type:tinyint;not null;default:0;index:idx_is_read" json:"isRead"`
	CreateTime  time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
}

// TableName 指定表名
func (SysWarnLog) TableName() string { return "sys_warn_log" }
