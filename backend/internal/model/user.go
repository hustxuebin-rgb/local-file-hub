package model

import "time"

// SysUser 用户模型
type SysUser struct {
	ID           int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Username     string    `gorm:"column:username;type:varchar(50);not null;uniqueIndex" json:"username"`
	Password     string    `gorm:"column:password;type:varchar(100);not null" json:"-"`
	Nickname     string    `gorm:"column:nickname;type:varchar(50);not null" json:"nickname"`
	Role         int8      `gorm:"column:role;type:tinyint;not null;default:2" json:"role"`
	StorageRoot  string    `gorm:"column:storage_root;type:varchar(255);not null;uniqueIndex" json:"storageRoot"`
	StorageQuota int64     `gorm:"column:storage_quota;type:bigint;not null;default:107374182400" json:"storageQuota"`
	UsedSize     int64     `gorm:"column:used_size;type:bigint;not null;default:0" json:"usedSize"`
	WxBind       *string   `gorm:"column:wx_bind;type:varchar(100);uniqueIndex" json:"wxBind"`
	AvatarURL    *string   `gorm:"column:avatar_url;type:varchar(512)" json:"avatarUrl"`
	Status       int8      `gorm:"column:status;type:tinyint;not null;default:1" json:"status"`
	CreateTime   time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime   time.Time `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (SysUser) TableName() string { return "sys_user" }
