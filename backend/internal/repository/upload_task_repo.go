package repository

import (
	"time"

	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// UploadTaskRepo 上传任务仓库
type UploadTaskRepo struct{ DB *gorm.DB }

// Create 创建上传任务
func (r *UploadTaskRepo) Create(task *model.UploadTask) error {
	return r.DB.Create(task).Error
}

// FindByTaskID 根据任务ID查找上传任务
func (r *UploadTaskRepo) FindByTaskID(taskID string) (*model.UploadTask, error) {
	var task model.UploadTask
	err := r.DB.Where("task_id = ?", taskID).First(&task).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

// UpdateChunkProgress 更新分块进度
func (r *UploadTaskRepo) UpdateChunkProgress(taskID string, finishedChunk int) error {
	return r.DB.Model(&model.UploadTask{}).Where("task_id = ?", taskID).
		Update("finished_chunk", finishedChunk).Error
}

// UpdateStatus 更新任务状态
func (r *UploadTaskRepo) UpdateStatus(taskID string, status int8) error {
	return r.DB.Model(&model.UploadTask{}).Where("task_id = ?", taskID).
		Update("status", status).Error
}

// DeleteByTaskID 根据任务ID删除上传任务
func (r *UploadTaskRepo) DeleteByTaskID(taskID string) error {
	return r.DB.Where("task_id = ?", taskID).Delete(&model.UploadTask{}).Error
}

// UpdateVisibility 更新上传任务的可见性
func (r *UploadTaskRepo) UpdateVisibility(taskID string, visibility int8) error {
	return r.DB.Model(&model.UploadTask{}).Where("task_id = ?", taskID).
		Update("visibility", visibility).Error
}

// FindByUserAndStatus 查询指定用户的指定状态任务列表
func (r *UploadTaskRepo) FindByUserAndStatus(userID int64, statuses []int8) ([]*model.UploadTask, error) {
	var tasks []*model.UploadTask
	err := r.DB.Where("user_id = ? AND status IN ?", userID, statuses).
		Order("create_time DESC").Find(&tasks).Error
	return tasks, err
}

// UpdatePauseTime 更新暂停时间
func (r *UploadTaskRepo) UpdatePauseTime(taskID string, pauseTime time.Time) error {
	return r.DB.Model(&model.UploadTask{}).Where("task_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":     model.UploadStatusPaused,
			"pause_time": pauseTime,
		}).Error
}

// FindExpiredPausedTasks 查找过期暂停任务（用于 Worker 清理）
func (r *UploadTaskRepo) FindExpiredPausedTasks(before time.Time) ([]*model.UploadTask, error) {
	var tasks []*model.UploadTask
	err := r.DB.Where("status = ? AND pause_time < ?", model.UploadStatusPaused, before).
		Find(&tasks).Error
	return tasks, err
}

// GetTodayStats 获取用户今日上传统计
func (r *UploadTaskRepo) GetTodayStats(userID int64) (*TodayStats, error) {
	var stats TodayStats
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	row := r.DB.Model(&model.UploadTask{}).
		Where("user_id = ? AND status = ? AND create_time >= ?", userID, model.UploadStatusCompleted, todayStart).
		Select("COUNT(*) as count, COALESCE(SUM(total_size), 0) as total_size").
		Row()
	if err := row.Scan(&stats.Count, &stats.TotalSize); err != nil {
		return nil, err
	}
	return &stats, nil
}

// BatchUpdateStatus 批量更新上传任务状态（带用户归属校验）
func (r *UploadTaskRepo) BatchUpdateStatus(userID int64, taskIDs []string, status int8) error {
	return r.DB.Model(&model.UploadTask{}).
		Where("user_id = ? AND task_id IN ?", userID, taskIDs).
		Update("status", status).Error
}
