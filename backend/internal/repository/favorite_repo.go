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

// FindByUserIDWithFilter 分页查询用户收藏，支持关键词搜索、目标类型过滤和排序
// keyword: 模糊匹配目标名称（文件名/文件夹名/分享资源名）
// targetType: nil 表示不过滤，否则按指定类型筛选
// sortBy: 排序字段标识，由 handler 层白名单校验后传入，可选值: target_name / target_size / favorite.create_time
// sortOrder: 排序方向，仅 asc 或 desc
func (r *FavoriteRepo) FindByUserIDWithFilter(userID int64, offset, limit int, keyword string, targetType *int8, sortBy, sortOrder string) ([]model.Favorite, int64, error) {
	var favorites []model.Favorite
	var total int64

	buildQuery := func() *gorm.DB {
		q := r.DB.Table("favorite").
			Joins("LEFT JOIN file_info ON favorite.target_type = 1 AND favorite.target_id = file_info.id").
			Joins("LEFT JOIN folder ON favorite.target_type = 2 AND favorite.target_id = folder.id").
			Joins("LEFT JOIN share_record ON favorite.target_type = 3 AND favorite.target_id = share_record.id").
			Joins("LEFT JOIN file_info AS sfi ON favorite.target_type = 3 AND share_record.share_type = 1 AND share_record.resource_id = sfi.id").
			Joins("LEFT JOIN folder AS sfo ON favorite.target_type = 3 AND share_record.share_type = 2 AND share_record.resource_id = sfo.id").
			Where("favorite.user_id = ?", userID)

		if keyword != "" {
			q = q.Where("COALESCE(file_info.file_name, folder.folder_name, sfi.file_name, sfo.folder_name) LIKE ?", "%"+keyword+"%")
		}
		if targetType != nil {
			q = q.Where("favorite.target_type = ?", *targetType)
		}
		return q
	}

	if err := buildQuery().Count(&total).Error; err != nil {
		return nil, 0, err
	}

	q := buildQuery().
		Select("favorite.*")

	// sortBy 已经过 handler 层白名单校验，安全拼接
	switch sortBy {
	case "target_name":
		q = q.Order("COALESCE(file_info.file_name, folder.folder_name, sfi.file_name, sfo.folder_name) " + sortOrder)
	case "target_size":
		q = q.Order("COALESCE(file_info.file_size, 0) " + sortOrder)
	default:
		q = q.Order("favorite.create_time " + sortOrder)
	}

	err := q.Offset(offset).Limit(limit).Find(&favorites).Error

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
