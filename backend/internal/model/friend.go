package model

import "time"

// FriendRequestPending 待处理
const FriendRequestPending int8 = 0

// FriendRequestAccepted 已同意
const FriendRequestAccepted int8 = 1

// FriendRequestRejected 已拒绝
const FriendRequestRejected int8 = 2

// FriendRelation 好友关系模型
type FriendRelation struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID     int64     `gorm:"column:user_id;type:bigint;not null;uniqueIndex:uk_user_friend" json:"userId"`
	FriendID   int64     `gorm:"column:friend_id;type:bigint;not null;uniqueIndex:uk_user_friend" json:"friendId"`
	CreateTime time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
}

// TableName 指定表名
func (FriendRelation) TableName() string { return "friend_relation" }

// FriendRequest 好友申请模型
type FriendRequest struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	FromUserID int64     `gorm:"column:from_user_id;type:bigint;not null" json:"fromUserId"`
	ToUserID   int64     `gorm:"column:to_user_id;type:bigint;not null" json:"toUserId"`
	Status     int8      `gorm:"column:status;type:tinyint;not null;default:0" json:"status"`
	Message    string    `gorm:"column:message;type:varchar(200);not null;default:''" json:"message"`
	CreateTime time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
	UpdateTime time.Time `gorm:"column:update_time;type:datetime;not null;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名
func (FriendRequest) TableName() string { return "friend_request" }
