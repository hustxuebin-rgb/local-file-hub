package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// FavoriteRepo 收藏仓库
type FavoriteRepo struct{ DB *gorm.DB }

// Create 创建收藏记录
func (r *FavoriteRepo) Create(favorite *model.Favorite) error {
	return r.DB.Create(favorite).Error
}

// Delete 根据唯一约束删除收藏记录
func (r *FavoriteRepo) Delete(userID int64, targetType int8, targetID int64) error {
	return r.DB.Where("user_id = ? AND target_type = ? AND target_id = ?", userID, targetType, targetID).
		Delete(&model.Favorite{}).Error
}

// FindByUserID 分页查询某用户的所有收藏，按 create_time DESC
func (r *FavoriteRepo) FindByUserID(userID int64, offset, limit int) ([]model.Favorite, int64, error) {
	var favorites []model.Favorite
	var total int64

	query := r.DB.Model(&model.Favorite{}).Where("user_id = ?", userID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&favorites).Error
	return favorites, total, err
}

// Exists 检查是否已收藏
func (r *FavoriteRepo) Exists(userID int64, targetType int8, targetID int64) (bool, error) {
	var count int64
	err := r.DB.Model(&model.Favorite{}).
		Where("user_id = ? AND target_type = ? AND target_id = ?", userID, targetType, targetID).
		Count(&count).Error
	return count > 0, err
}
