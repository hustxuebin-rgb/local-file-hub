package model

import "time"

// ShareRecord 分享记录模型
type ShareRecord struct {
	ID            int64      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	ShareType     int8       `gorm:"column:share_type;type:tinyint;not null;index:idx_resource_type" json:"shareType"`
	ResourceID    int64      `gorm:"column:resource_id;type:bigint;not null;index:idx_resource_type" json:"resourceId"`
	ShareUserID   int64      `gorm:"column:share_user_id;type:bigint;not null;index:idx_share_user" json:"shareUserId"`
	ReceiveUserID int64      `gorm:"column:receive_user_id;type:bigint;not null;index:idx_receive_user" json:"receiveUserId"`
	SharePerm     int8       `gorm:"column:share_perm;type:tinyint;not null;default:1" json:"sharePerm"`
	ExpireType    int8       `gorm:"column:expire_type;type:tinyint;not null;default:1" json:"expireType"`
	ExpireTime    *time.Time `gorm:"column:expire_time;type:datetime" json:"expireTime"`
	Status        int8       `gorm:"column:status;type:tinyint;not null;default:1" json:"status"`
	CreateTime    time.Time  `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime    time.Time  `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (ShareRecord) TableName() string { return "share_record" }
