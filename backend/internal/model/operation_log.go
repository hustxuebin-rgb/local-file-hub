package model

import "time"

// SysOperationLog 操作日志模型
type SysOperationLog struct {
	ID           int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID       *int64    `gorm:"column:user_id;type:bigint;index:idx_user_time" json:"userId"`
	DeviceID     *int64    `gorm:"column:device_id;type:bigint" json:"deviceId"`
	OperType     int8      `gorm:"column:oper_type;type:tinyint;not null;index:idx_oper_time" json:"operType"`
	ResourceType *int8     `gorm:"column:resource_type;type:tinyint" json:"resourceType"`
	ResourceID   *int64    `gorm:"column:resource_id;type:bigint" json:"resourceId"`
	TargetUserID *int64    `gorm:"column:target_user_id;type:bigint" json:"targetUserId"`
	OperDesc     string    `gorm:"column:oper_desc;type:varchar(500);not null;default:''" json:"operDesc"`
	LocalIP      string    `gorm:"column:local_ip;type:varchar(50);not null;default:''" json:"localIp"`
	CreateTime   time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime;index:idx_user_time;index:idx_oper_time" json:"createTime"`
}

// TableName 指定表名
func (SysOperationLog) TableName() string { return "sys_operation_log" }
