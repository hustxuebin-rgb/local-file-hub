package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// FolderRepo 文件夹仓库
type FolderRepo struct{ DB *gorm.DB }

// Create 创建文件夹
func (r *FolderRepo) Create(folder *model.Folder) error {
	return r.DB.Create(folder).Error
}

// FindByID 根据ID查找文件夹
func (r *FolderRepo) FindByID(id int64) (*model.Folder, error) {
	var folder model.Folder
	err := r.DB.First(&folder, id).Error
	if err != nil {
		return nil, err
	}
	return &folder, nil
}

// FindByUserAndParent 查找用户下指定父目录的子文件夹列表
func (r *FolderRepo) FindByUserAndParent(userID, parentID int64) ([]model.Folder, error) {
	var folders []model.Folder
	err := r.DB.Where("user_id = ? AND parent_id = ?", userID, parentID).
		Order("sort ASC, id ASC").Find(&folders).Error
	return folders, err
}

// FindByUser 查找用户的所有文件夹
func (r *FolderRepo) FindByUser(userID int64) ([]model.Folder, error) {
	var folders []model.Folder
	err := r.DB.Where("user_id = ?", userID).
		Order("sort ASC, id ASC").Find(&folders).Error
	return folders, err
}

// FindByNameUnderParent 检查同名文件夹是否存在
func (r *FolderRepo) FindByNameUnderParent(userID, parentID int64, folderName string) (*model.Folder, error) {
	var folder model.Folder
	err := r.DB.Where("user_id = ? AND parent_id = ? AND folder_name = ?", userID, parentID, folderName).
		First(&folder).Error
	if err != nil {
		return nil, err
	}
	return &folder, nil
}

// Update 更新文件夹
func (r *FolderRepo) Update(folder *model.Folder) error {
	return r.DB.Save(folder).Error
}

// DeleteByID 根据ID删除文件夹
func (r *FolderRepo) DeleteByID(id int64) error {
	return r.DB.Delete(&model.Folder{}, id).Error
}

// DeleteByUserAndID 根据用户和ID删除文件夹（确保数据隔离）
func (r *FolderRepo) DeleteByUserAndID(userID, id int64) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.Folder{}).Error
}

// FindByUserAndPublic 按用户和可见性查找文件夹（用于构建树）
// isPublic 为 nil 时不过滤
func (r *FolderRepo) FindByUserAndPublic(userID int64, isPublic *int8) ([]model.Folder, error) {
	var folders []model.Folder
	query := r.DB.Where("user_id = ?", userID)
	if isPublic != nil {
		query = query.Where("is_public = ?", *isPublic)
	}
	err := query.Order("sort ASC, id ASC").Find(&folders).Error
	return folders, err
}

// CountByUser 统计用户文件夹总数
func (r *FolderRepo) CountByUser(userID int64) (int64, error) {
	var count int64
	err := r.DB.Model(&model.Folder{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}
