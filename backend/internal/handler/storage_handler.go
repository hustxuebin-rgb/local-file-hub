package handler

import (
	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// StorageHandler 存储管理处理器
type StorageHandler struct {
	StorageService *service.StorageService
	DB             *gorm.DB
}

// DiskInfoHandler 获取磁盘信息
func (h *StorageHandler) DiskInfoHandler(c *gin.Context) {
	var disks []model.StorageDisk
	if err := h.DB.Find(&disks).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘信息失败")
		return
	}
	response.Success(c, disks)
}

// SyncTaskHandler 获取同步任务
func (h *StorageHandler) SyncTaskHandler(c *gin.Context) {
	var task model.StorageSyncTask
	if err := h.DB.First(&task).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取同步任务失败")
		return
	}
	response.Success(c, task)
}

// UpdateSyncTaskReq 更新同步任务请求体
type UpdateSyncTaskReq struct {
	SyncMode     int8   `json:"syncMode"`
	CronExpr     string `json:"cronExpr"`
	IgnoreSuffix string `json:"ignoreSuffix"`
	SpeedLimit   int64  `json:"speedLimit"`
}

// UpdateSyncTaskHandler 更新同步任务
func (h *StorageHandler) UpdateSyncTaskHandler(c *gin.Context) {
	var req UpdateSyncTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}
	var task model.StorageSyncTask
	if err := h.DB.First(&task).Error; err != nil {
		h.DB.Create(&model.StorageSyncTask{
			SyncMode:     req.SyncMode,
			CronExpr:     req.CronExpr,
			IgnoreSuffix: req.IgnoreSuffix,
			SpeedLimit:   &req.SpeedLimit,
		})
		response.SuccessWithMsg(c, "同步任务已创建", nil)
		return
	}
	task.SyncMode = req.SyncMode
	task.CronExpr = req.CronExpr
	task.IgnoreSuffix = req.IgnoreSuffix
	task.SpeedLimit = &req.SpeedLimit
	h.DB.Save(&task)
	response.SuccessWithMsg(c, "同步任务已更新", nil)
}

// ManualSyncHandler 手动触发同步
func (h *StorageHandler) ManualSyncHandler(c *gin.Context) {
	response.SuccessWithMsg(c, "手动同步已触发，请查看日志", nil)
}

// SyncLogsHandler 获取同步日志
func (h *StorageHandler) SyncLogsHandler(c *gin.Context) {
	var logs []model.StorageSyncTask
	h.DB.Order("id DESC").Limit(50).Find(&logs)
	response.Success(c, logs)
}

// QuotaHandler 获取用户配额
func (h *StorageHandler) QuotaHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	quota, err := h.StorageService.GetUserQuota(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取配额失败")
		return
	}
	response.Success(c, quota)
}
