package repository

import (
	"fmt"
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
func (r *FileRepo) FindByUserAndFolder(userID, folderID int64, visibility *int8, keyword string, fileType *int8, sortBy string, sortOrder string, offset, limit int) ([]model.FileInfo, int64, error) {
	var files []model.FileInfo
	var total int64

	var query *gorm.DB
	if keyword != "" {
		query = r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND is_delete = 0", userID)
		query = query.Where("file_name LIKE ?", "%"+keyword+"%")
	} else {
		query = r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND folder_id = ? AND is_delete = 0", userID, folderID)
	}

	if visibility != nil {
		query = query.Where("visibility = ?", *visibility)
	}

	if fileType != nil {
		query = query.Where("file_type = ?", *fileType)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	orderClause := buildOrderClause(sortBy, sortOrder)
	err := query.Order(orderClause).Offset(offset).Limit(limit).Find(&files).Error
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

// FindAllInFolder 查找用户指定文件夹下所有未删除的文件（不分页）
func (r *FileRepo) FindAllInFolder(userID, folderID int64) ([]model.FileInfo, error) {
	var files []model.FileInfo
	err := r.DB.Where("user_id = ? AND folder_id = ? AND is_delete = 0", userID, folderID).
		Order("file_name ASC").Find(&files).Error
	return files, err
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

// UpdateVisibility 更新文件可见性
func (r *FileRepo) UpdateVisibility(id int64, visibility int8) error {
	return r.DB.Model(&model.FileInfo{}).Where("id = ?", id).Update("visibility", visibility).Error
}

// FindPublicFiles 查询所有用户公开且未删除的文件（分页，支持过滤和排序）
// 公共空间只展示上传到公共文件夹的内容（upload_task.visibility=1），兼容旧数据（task_id IS NULL）
func (r *FileRepo) FindPublicFiles(folderID int64, keyword string, fileType *int8, sortBy string, sortOrder string, offset, limit int) ([]model.FileInfo, int64, error) {
	var files []model.FileInfo
	var total int64

	query := r.DB.Model(&model.FileInfo{}).
		Joins("LEFT JOIN upload_task ON file_info.task_id = upload_task.task_id").
		Where("file_info.visibility = 1 AND file_info.is_delete = 0").
		Where("(file_info.task_id IS NULL OR upload_task.visibility = 1)")

	if folderID > 0 {
		query = query.Where("file_info.folder_id = ?", folderID)
	}

	if keyword != "" {
		query = query.Where("file_info.file_name LIKE ?", "%"+keyword+"%")
	}

	if fileType != nil {
		query = query.Where("file_info.file_type = ?", *fileType)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	orderClause := buildOrderClause(sortBy, sortOrder)
	err := query.Order(orderClause).Offset(offset).Limit(limit).Find(&files).Error
	return files, total, err
}

// SumSizeByUser 统计用户未删除文件的总大小
func (r *FileRepo) SumSizeByUser(userID int64) (int64, error) {
	var total int64
	err := r.DB.Model(&model.FileInfo{}).Where("user_id = ? AND is_delete = 0", userID).
		Select("COALESCE(SUM(file_size), 0)").Scan(&total).Error
	return total, err
}

// buildOrderClause 构建排序子句（统一使用 file_info 表前缀避免 JOIN 时歧义）
func buildOrderClause(sortBy, sortOrder string) string {
	// 白名单校验，防止 SQL 注入
	validSortBy := map[string]string{
		"name":       "file_info.file_name",
		"fileSize":   "file_info.file_size",
		"fileType":   "file_info.file_type",
		"createTime": "file_info.create_time",
	}

	col, ok := validSortBy[sortBy]
	if !ok {
		col = "file_info.create_time"
	}

	direction := "DESC"
	if sortOrder == "asc" {
		direction = "ASC"
	}

	return fmt.Sprintf("%s %s", col, direction)
}
