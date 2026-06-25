package repository

import (
	"time"

	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// ShareRepo 分享记录仓库
type ShareRepo struct{ DB *gorm.DB }

// Create 创建分享记录
func (r *ShareRepo) Create(share *model.ShareRecord) error { return r.DB.Create(share).Error }

// FindByID 根据ID查找分享记录
func (r *ShareRepo) FindByID(id int64) (*model.ShareRecord, error) {
	var share model.ShareRecord
	err := r.DB.First(&share, id).Error
	if err != nil {
		return nil, err
	}
	return &share, nil
}

// FindByShareUserID 查找用户分享出的记录
func (r *ShareRepo) FindByShareUserID(shareUserID int64) ([]model.ShareRecord, error) {
	var shares []model.ShareRecord
	err := r.DB.Where("share_user_id = ? AND status = 1", shareUserID).Order("create_time DESC").Find(&shares).Error
	return shares, err
}

// FindByReceiveUserID 查找用户收到的分享记录
func (r *ShareRepo) FindByReceiveUserID(receiveUserID int64) ([]model.ShareRecord, error) {
	var shares []model.ShareRecord
	err := r.DB.Where("receive_user_id = ? AND status = 1", receiveUserID).Order("create_time DESC").Find(&shares).Error
	return shares, err
}

// FindByResource 根据资源ID和类型查找活跃分享
func (r *ShareRepo) FindByResource(resourceID int64, shareType int8) (*model.ShareRecord, error) {
	var share model.ShareRecord
	err := r.DB.Where("resource_id = ? AND share_type = ? AND status = 1", resourceID, shareType).First(&share).Error
	if err != nil {
		return nil, err
	}
	return &share, nil
}

// Update 更新分享记录
func (r *ShareRepo) Update(share *model.ShareRecord) error { return r.DB.Save(share).Error }

// Deactivate 将分享状态置为无效
func (r *ShareRepo) Deactivate(id int64) error {
	return r.DB.Model(&model.ShareRecord{}).Where("id = ?", id).Update("status", 0).Error
}

// FindExpiredShares 查找已过期的活跃分享
func (r *ShareRepo) FindExpiredShares() ([]model.ShareRecord, error) {
	var shares []model.ShareRecord
	err := r.DB.Where("expire_time IS NOT NULL AND expire_time < ? AND status = 1", time.Now()).Find(&shares).Error
	return shares, err
}
