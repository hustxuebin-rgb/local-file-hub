package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// OperationLogRepo 操作日志仓库
type OperationLogRepo struct{ DB *gorm.DB }

// Create 创建操作日志
func (r *OperationLogRepo) Create(log *model.SysOperationLog) error {
	return r.DB.Create(log).Error
}
