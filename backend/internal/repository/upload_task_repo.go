package repository

import (
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
