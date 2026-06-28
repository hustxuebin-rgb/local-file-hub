package repository

import (
	"local-file-hub/backend/internal/model"
	"time"

	"gorm.io/gorm"
)

// DownloadTaskRepo 下载任务仓库
type DownloadTaskRepo struct{ DB *gorm.DB }

// Create 创建下载任务
func (r *DownloadTaskRepo) Create(task *model.DownloadTask) error {
	return r.DB.Create(task).Error
}

// FindByTaskID 根据任务ID查找下载任务
func (r *DownloadTaskRepo) FindByTaskID(taskID string) (*model.DownloadTask, error) {
	var task model.DownloadTask
	err := r.DB.Where("task_id = ?", taskID).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

// UpdateProgress 更新已下载大小
func (r *DownloadTaskRepo) UpdateProgress(taskID string, downloadedSize int64) error {
	return r.DB.Model(&model.DownloadTask{}).Where("task_id = ?", taskID).
		Update("downloaded_size", downloadedSize).Error
}

// UpdateStatus 更新任务状态
func (r *DownloadTaskRepo) UpdateStatus(taskID string, status int8) error {
	return r.DB.Model(&model.DownloadTask{}).Where("task_id = ?", taskID).
		Update("status", status).Error
}

// FindByUserAndStatuses 分页查询指定用户的指定状态下载任务列表
func (r *DownloadTaskRepo) FindByUserAndStatuses(userID int64, statuses []int8, offset, limit int) ([]*model.DownloadTask, int64, error) {
	var tasks []*model.DownloadTask
	var total int64

	query := r.DB.Model(&model.DownloadTask{}).Where("user_id = ? AND status IN ?", userID, statuses)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&tasks).Error
	return tasks, total, err
}

// DeleteByTaskID 根据任务ID删除下载任务
func (r *DownloadTaskRepo) DeleteByTaskID(taskID string) error {
	return r.DB.Where("task_id = ?", taskID).Delete(&model.DownloadTask{}).Error
}

// FindExpiredTasks 查找过期下载任务（用于 Worker 清理）
func (r *DownloadTaskRepo) FindExpiredTasks(before time.Time, status int8) ([]*model.DownloadTask, error) {
	var tasks []*model.DownloadTask
	err := r.DB.Where("status = ? AND update_time < ?", status, before).
		Find(&tasks).Error
	return tasks, err
}

// FindHistoryByUser 分页查询用户历史下载任务（已完成/失败/取消），支持fileName模糊搜索
func (r *DownloadTaskRepo) FindHistoryByUser(userID int64, statuses []int8, keyword string, offset, limit int) ([]*model.DownloadTask, int64, error) {
	var tasks []*model.DownloadTask
	var total int64

	query := r.DB.Model(&model.DownloadTask{}).Where("user_id = ? AND status IN ?", userID, statuses)
	if keyword != "" {
		query = query.Where("file_name LIKE ?", "%"+keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&tasks).Error
	return tasks, total, err
}

// TodayStats 今日下载统计
type TodayStats struct {
	Count     int64 `json:"count"`
	TotalSize int64 `json:"totalSize"`
	AvgSpeed  int64 `json:"avgSpeed"`
}

// GetTodayStats 获取用户今日下载统计
func (r *DownloadTaskRepo) GetTodayStats(userID int64) (*TodayStats, error) {
	var stats TodayStats
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	row := r.DB.Model(&model.DownloadTask{}).
		Where("user_id = ? AND status = ? AND create_time >= ?", userID, model.DownloadStatusCompleted, todayStart).
		Select("COUNT(*) as count, COALESCE(SUM(total_size), 0) as total_size").
		Row()
	if err := row.Scan(&stats.Count, &stats.TotalSize); err != nil {
		return nil, err
	}
	return &stats, nil
}

// BatchUpdateStatus 批量更新任务状态（带用户归属校验）
func (r *DownloadTaskRepo) BatchUpdateStatus(userID int64, taskIDs []string, status int8) error {
	return r.DB.Model(&model.DownloadTask{}).
		Where("user_id = ? AND task_id IN ?", userID, taskIDs).
		Update("status", status).Error
}

// FindByIDsAndUser 批量归属校验：返回所有匹配的任务
func (r *DownloadTaskRepo) FindByIDsAndUser(userID int64, taskIDs []string) ([]*model.DownloadTask, error) {
	var tasks []*model.DownloadTask
	err := r.DB.Where("user_id = ? AND task_id IN ?", userID, taskIDs).Find(&tasks).Error
	return tasks, err
}
