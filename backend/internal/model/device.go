package model

import "time"

// SysDevice 设备模型
type SysDevice struct {
	ID            int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID        int64      `gorm:"column:user_id;type:bigint;not null;index" json:"userId"`
	DeviceType    int8       `gorm:"column:device_type;type:tinyint;not null" json:"deviceType"`
	DeviceName    string     `gorm:"column:device_name;type:varchar(100);default:''" json:"deviceName"`
	LocalIP       string     `gorm:"column:local_ip;type:varchar(50);not null" json:"localIp"`
	Token         string     `gorm:"column:token;type:varchar(255);not null" json:"-"`
	Online        int8       `gorm:"column:online;type:tinyint;not null;default:0" json:"online"`
	LastLoginTime *time.Time `gorm:"column:last_login_time;type:datetime" json:"lastLoginTime"`
	CreateTime    time.Time  `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
}

// TableName 指定表名
func (SysDevice) TableName() string { return "sys_device" }
