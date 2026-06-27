package handler

import (
	"strconv"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// LogHandler 日志处理器
type LogHandler struct{ DB *gorm.DB }

// OperateLogHandler 获取操作日志
func (h *LogHandler) OperateLogHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	page := c.DefaultQuery("page", "1")
	size := c.DefaultQuery("size", "20")

	limit := 20
	if s, e := strconv.Atoi(size); e == nil && s > 0 && s <= 100 {
		limit = s
	}

	offset := 0
	if p, e := strconv.Atoi(page); e == nil && p > 0 {
		offset = (p - 1) * limit
	}

	operType := c.Query("operType")

	var logs []model.SysOperationLog
	var total int64

	query := h.DB.Model(&model.SysOperationLog{}).Where("user_id = ?", userID)
	if operType != "" && operType != "0" {
		if ot, e := strconv.ParseInt(operType, 10, 8); e == nil {
			query = query.Where("oper_type = ?", int8(ot))
		}
	}

	query.Count(&total)
	query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&logs)
	response.Success(c, map[string]interface{}{"total": total, "list": logs})
}

// MyOperateLogHandler 普通用户查自己日志（无需admin权限）
func (h *LogHandler) MyOperateLogHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	page := c.DefaultQuery("page", "1")
	size := c.DefaultQuery("size", "20")

	limit := 20
	if s, e := strconv.Atoi(size); e == nil && s > 0 && s <= 100 {
		limit = s
	}

	offset := 0
	if p, e := strconv.Atoi(page); e == nil && p > 0 {
		offset = (p - 1) * limit
	}

	operType := c.Query("operType")

	var logs []model.SysOperationLog
	var total int64

	query := h.DB.Model(&model.SysOperationLog{}).Where("user_id = ?", userID)
	if operType != "" && operType != "0" {
		if ot, e := strconv.ParseInt(operType, 10, 8); e == nil {
			query = query.Where("oper_type = ?", int8(ot))
		}
	}

	query.Count(&total)
	query.Order("create_time DESC").Offset(offset).Limit(limit).Find(&logs)
	response.Success(c, map[string]interface{}{"total": total, "list": logs})
}

// WarnLogHandler 获取告警日志
func (h *LogHandler) WarnLogHandler(c *gin.Context) {
	var logs []model.SysWarnLog
	h.DB.Order("create_time DESC").Limit(50).Find(&logs)
	response.Success(c, logs)
}

// ReadWarnReq 标记告警已读请求体
type ReadWarnReq struct {
	IDs []int64 `json:"ids"`
}

// ReadWarnHandler 标记告警为已读
func (h *LogHandler) ReadWarnHandler(c *gin.Context) {
	var req ReadWarnReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}
	h.DB.Model(&model.SysWarnLog{}).Where("id IN ?", req.IDs).Update("is_read", 1)
	response.SuccessWithMsg(c, "已标记为已读", nil)
}
