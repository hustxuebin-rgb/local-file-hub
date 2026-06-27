package model

import "time"

// Favorite 收藏模型
type Favorite struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	UserID     int64     `gorm:"column:user_id;type:bigint;not null;uniqueIndex:uk_user_target;index:idx_user_id" json:"userId"`
	TargetType int8      `gorm:"column:target_type;type:tinyint;not null;uniqueIndex:uk_user_target" json:"targetType"`
	TargetID   int64     `gorm:"column:target_id;type:bigint;not null;uniqueIndex:uk_user_target" json:"targetId"`
	CreateTime time.Time `gorm:"column:create_time;type:datetime;not null;autoCreateTime" json:"createTime"`
}

// TableName 指定表名
func (Favorite) TableName() string { return "favorite" }

// 收藏目标类型常量
const (
	FavoriteTargetFile   int8 = 1
	FavoriteTargetFolder int8 = 2
	FavoriteTargetShare  int8 = 3
)
