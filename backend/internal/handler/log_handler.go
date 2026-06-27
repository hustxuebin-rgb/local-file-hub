package handler

import (
	"strconv"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// LogHandler 日志处理器
type LogHandler struct{ DB *gorm.DB }

// parsePagination 解析分页参数，返回 limit 和 offset。
// page/size 为原始查询字符串，内部处理默认值与边界校验。
func parsePagination(page, size string) (limit int, offset int) {
	limit = 20
	if s, e := strconv.Atoi(size); e == nil && s > 0 && s <= 100 {
		limit = s
	}

	offset = 0
	if p, e := strconv.Atoi(page); e == nil && p > 0 {
		offset = (p - 1) * limit
	}

	return
}

// queryOperationLogs 查询操作日志，返回日志列表、总数及错误。
func queryOperationLogs(db *gorm.DB, userID int64, page, size, operType string) ([]OperationLogResp, int64, error) {
	limit, offset := parsePagination(page, size)

	var logs []OperationLogResp
	var total int64

	baseQuery := db.Table("sys_operation_log").
		Select("sys_operation_log.*, sys_user.nickname AS user_name").
		Joins("LEFT JOIN sys_user ON sys_user.id = sys_operation_log.user_id").
		Where("sys_operation_log.user_id = ?", userID)

	if operType != "" && operType != "0" {
		if ot, e := strconv.ParseInt(operType, 10, 8); e == nil {
			baseQuery = baseQuery.Where("sys_operation_log.oper_type = ?", int8(ot))
		}
	}

	baseQuery.Count(&total)
	baseQuery.Order("sys_operation_log.create_time DESC").Offset(offset).Limit(limit).Find(&logs)

	return logs, total, nil
}

// OperateLogHandler 获取操作日志
func (h *LogHandler) OperateLogHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	page := c.DefaultQuery("page", "1")
	size := c.DefaultQuery("size", "20")
	operType := c.Query("operType")

	logs, total, _ := queryOperationLogs(h.DB, userID, page, size, operType)
	response.Success(c, map[string]interface{}{"total": total, "list": logs})
}

// OperationLogResp 操作日志响应（含用户名）
type OperationLogResp struct {
	ID           int64     `json:"id"`
	UserID       *int64    `json:"userId"`
	UserName     string    `json:"userName"`
	DeviceID     *int64    `json:"deviceId"`
	OperType     int8      `json:"operType"`
	ResourceType *int8     `json:"resourceType"`
	ResourceID   *int64    `json:"resourceId"`
	TargetUserID *int64    `json:"targetUserId"`
	OperDesc     string    `json:"operDesc"`
	LocalIP      string    `json:"localIp"`
	CreateTime   time.Time `json:"createTime"`
}

// MyOperateLogHandler 普通用户查自己日志（无需admin权限）
func (h *LogHandler) MyOperateLogHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	page := c.DefaultQuery("page", "1")
	size := c.DefaultQuery("size", "20")
	operType := c.Query("operType")

	logs, total, _ := queryOperationLogs(h.DB, userID, page, size, operType)
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
