package repository

import (
	"time"

	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// FileRepo 文件仓库
type FileRepo struct{ DB *gorm.DB }

// Create 创建文件记录
func (r *FileRepo) Create(file *model.FileInfo) error {
	return r.DB.Create(file).Error
}

// FindByID 根据ID查找文件
func (r *FileRepo) FindByID(id int64) (*model.FileInfo, error) {
	var file model.FileInfo
	err := r.DB.First(&file, id).Error
	if err != nil {
		return nil, err
	}
	return &file, nil
}

// FindByUserAndFolder 查找用户指定目录下的文件（分页，不含已删除）
func (r *FileRepo) FindByUserAndFolder(userID, folderID int64, offset, limit int) ([]model.FileInfo, int64, error) {
	var files []model.FileInfo
	var total int64

	query := r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND folder_id = ? AND is_delete = 0", userID, folderID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&files).Error
	return files, total, err
}

// FindByMD5 根据MD5查找未删除的文件（用于秒传检测）
func (r *FileRepo) FindByMD5(md5 string) (*model.FileInfo, error) {
	var file model.FileInfo
	err := r.DB.Where("md5 = ? AND is_delete = 0", md5).First(&file).Error
	if err != nil {
		return nil, err
	}
	return &file, nil
}

// FindByNameInFolder 查找用户指定文件夹下的同名未删除文件
func (r *FileRepo) FindByNameInFolder(userID, folderID int64, fileName string) (*model.FileInfo, error) {
	var file model.FileInfo
	err := r.DB.Where("user_id = ? AND folder_id = ? AND file_name = ? AND is_delete = 0",
		userID, folderID, fileName).First(&file).Error
	if err != nil {
		return nil, err
	}
	return &file, nil
}

// Update 更新文件记录
func (r *FileRepo) Update(file *model.FileInfo) error {
	return r.DB.Save(file).Error
}

// SoftDelete 软删除文件
func (r *FileRepo) SoftDelete(id int64) error {
	now := time.Now()
	return r.DB.Model(&model.FileInfo{}).Where("id = ?", id).
		Updates(map[string]interface{}{"is_delete": 1, "delete_time": now}).Error
}

// FindRecycleByUser 查找用户回收站文件（分页）
func (r *FileRepo) FindRecycleByUser(userID int64, offset, limit int) ([]model.FileInfo, int64, error) {
	var files []model.FileInfo
	var total int64

	query := r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND is_delete = 1", userID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("delete_time DESC").Offset(offset).Limit(limit).Find(&files).Error
	return files, total, err
}

// Recover 从回收站恢复文件
func (r *FileRepo) Recover(id int64) error {
	return r.DB.Model(&model.FileInfo{}).Where("id = ?", id).
		Updates(map[string]interface{}{"is_delete": 0, "delete_time": nil}).Error
}

// HardDelete 物理删除文件记录
func (r *FileRepo) HardDelete(id int64) error {
	return r.DB.Delete(&model.FileInfo{}, id).Error
}

// SumSizeByUser 统计用户未删除文件的总大小
func (r *FileRepo) SumSizeByUser(userID int64) (int64, error) {
	var total int64
	err := r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND is_delete = 0", userID).
		Select("COALESCE(SUM(file_size), 0)").Scan(&total).Error
	return total, err
}
