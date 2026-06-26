package handler

import (
	"log"
	"os"
	"strconv"
	"syscall"

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

// DiskInfoHandler 获取磁盘信息（实时刷新文件系统状态）
func (h *StorageHandler) DiskInfoHandler(c *gin.Context) {
	var disks []model.StorageDisk
	if err := h.DB.Find(&disks).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘信息失败")
		return
	}

	// 遍历刷新每个磁盘的实际文件系统状态
	for i := range disks {
		var stat syscall.Statfs_t
		if err := syscall.Statfs(disks[i].DiskPath, &stat); err != nil {
			// 路径不可访问，标记为离线
			disks[i].Status = 0
			if err := h.DB.Model(&disks[i]).Update("status", int8(0)).Error; err != nil {
				log.Printf("更新磁盘 %s 离线状态失败: %v", disks[i].DiskPath, err)
			}
			continue
		}
		totalSize := int64(stat.Blocks) * int64(stat.Bsize)
		availableSize := int64(stat.Bavail) * int64(stat.Bsize)
		usedSize := totalSize - availableSize

		// 更新磁盘信息
		if err := h.DB.Model(&disks[i]).Updates(map[string]interface{}{
			"total_size":     totalSize,
			"used_size":      usedSize,
			"available_size": availableSize,
			"status":         int8(1),
		}).Error; err != nil {
			log.Printf("更新磁盘 %s 信息失败: %v", disks[i].DiskPath, err)
		}
		disks[i].TotalSize = totalSize
		disks[i].UsedSize = usedSize
		disks[i].AvailableSize = availableSize
		disks[i].Status = 1
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

// CreateDiskReq 创建磁盘请求体
type CreateDiskReq struct {
	DiskPath string `json:"diskPath" binding:"required"`
	DiskType int8   `json:"diskType" binding:"required"`
	Remark   string `json:"remark"`
}

// UpdateDiskReq 更新磁盘请求体
type UpdateDiskReq struct {
	DiskPath *string `json:"diskPath"`
	DiskType *int8   `json:"diskType"`
	Status   *int8   `json:"status"`
	Remark   *string `json:"remark"`
}

// CreateDiskHandler 创建磁盘
func (h *StorageHandler) CreateDiskHandler(c *gin.Context) {
	var req CreateDiskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	// 校验 diskPath 是否存在
	if info, err := os.Stat(req.DiskPath); err != nil || !info.IsDir() {
		response.Error(c, response.CodeBadRequest, "磁盘路径不存在或不是目录")
		return
	}

	// 获取磁盘容量信息
	var stat syscall.Statfs_t
	if err := syscall.Statfs(req.DiskPath, &stat); err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘信息失败")
		return
	}
	totalSize := int64(stat.Blocks) * int64(stat.Bsize)
	availableSize := int64(stat.Bavail) * int64(stat.Bsize)
	usedSize := totalSize - availableSize

	disk := &model.StorageDisk{
		DiskType:      req.DiskType,
		DiskPath:      req.DiskPath,
		TotalSize:     totalSize,
		UsedSize:      usedSize,
		AvailableSize: availableSize,
		Status:        1, // 默认正常
		Remark:        req.Remark,
	}

	if err := h.DB.Create(disk).Error; err != nil {
		response.Error(c, response.CodeInternal, "创建磁盘记录失败")
		return
	}

	response.SuccessWithMsg(c, "磁盘已添加", disk)
}

// UpdateDiskHandler 更新磁盘
func (h *StorageHandler) UpdateDiskHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	var req UpdateDiskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	var disk model.StorageDisk
	if err := h.DB.First(&disk, id).Error; err != nil {
		response.Error(c, response.CodeNotFound, "磁盘不存在")
		return
	}

	updates := map[string]interface{}{}
	if req.DiskPath != nil {
		updates["disk_path"] = *req.DiskPath
	}
	if req.DiskType != nil {
		updates["disk_type"] = *req.DiskType
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&disk).Updates(updates).Error; err != nil {
			response.Error(c, response.CodeInternal, "更新磁盘失败")
			return
		}
	}

	response.SuccessWithMsg(c, "磁盘已更新", nil)
}

// DeleteDiskHandler 删除磁盘
func (h *StorageHandler) DeleteDiskHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	var disk model.StorageDisk
	if err := h.DB.First(&disk, id).Error; err != nil {
		response.Error(c, response.CodeNotFound, "磁盘不存在")
		return
	}

	if err := h.DB.Delete(&disk).Error; err != nil {
		response.Error(c, response.CodeInternal, "删除磁盘失败")
		return
	}

	response.SuccessWithMsg(c, "磁盘已删除", nil)
}
