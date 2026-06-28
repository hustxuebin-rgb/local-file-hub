package handler

import (
	"errors"
	"strconv"

	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// ShareHandler 分享处理器
type ShareHandler struct {
	ShareService *service.ShareService
}

// CreateShareReq 创建分享请求
type CreateShareReq struct {
	ReceiveUserID int64 `json:"receiveUserId" binding:"required"`
	ResourceID    int64 `json:"resourceId" binding:"required"`
	ShareType     int8  `json:"shareType" binding:"required"`
	SharePerm     int8  `json:"sharePerm" binding:"required"`
	ExpireType    int8  `json:"expireType" binding:"required"`
}

// UpdateShareReq 更新分享请求
type UpdateShareReq struct {
	SharePerm  int8 `json:"sharePerm" binding:"required"`
	ExpireType int8 `json:"expireType" binding:"required"`
}

// CreateHandler 创建分享
func (h *ShareHandler) CreateHandler(c *gin.Context) {
	var req CreateShareReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	result, err := h.ShareService.CreateShare(userID, req.ReceiveUserID, req.ResourceID, req.ShareType, req.SharePerm, req.ExpireType)
	if err != nil {
		handleShareError(c, err)
		return
	}

	response.Success(c, result)
}

// MySharesHandler 获取我分享出的记录
func (h *ShareHandler) MySharesHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	shares, err := h.ShareService.GetMyShares(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取分享列表失败")
		return
	}

	response.Success(c, gin.H{"list": shares, "total": len(shares)})
}

// ReceivedSharesHandler 获取我收到的分享
func (h *ShareHandler) ReceivedSharesHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	shares, err := h.ShareService.GetReceivedShares(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取分享列表失败")
		return
	}

	response.Success(c, gin.H{"list": shares, "total": len(shares)})
}

// ContentsHandler 获取分享内容详情
func (h *ShareHandler) ContentsHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	shareID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	result, err := h.ShareService.GetShareContents(shareID, userID)
	if err != nil {
		handleShareError(c, err)
		return
	}

	response.Success(c, result)
}

// UpdateHandler 更新分享设置
func (h *ShareHandler) UpdateHandler(c *gin.Context) {
	var req UpdateShareReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	shareID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	if err := h.ShareService.UpdateShare(shareID, userID, req.SharePerm, req.ExpireType); err != nil {
		handleShareError(c, err)
		return
	}

	response.SuccessWithMsg(c, "分享设置已更新", nil)
}

// CancelHandler 取消分享
func (h *ShareHandler) CancelHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	shareID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	if err := h.ShareService.CloseShare(shareID, userID); err != nil {
		handleShareError(c, err)
		return
	}

	response.SuccessWithMsg(c, "分享已取消", nil)
}

// ViewersHandler 获取分享的查看者列表
func (h *ShareHandler) ViewersHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	shareID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	viewers, err := h.ShareService.GetShareViewers(shareID, userID)
	if err != nil {
		handleShareError(c, err)
		return
	}

	response.Success(c, gin.H{"list": viewers, "total": len(viewers)})
}

// BatchCreateShareReq 批量创建分享请求
type BatchCreateShareReq struct {
	Items []BatchShareItemReq `json:"items" binding:"required"`
}

// BatchShareItemReq 批量分享项请求
type BatchShareItemReq struct {
	ReceiveUserID int64 `json:"receiveUserId" binding:"required"`
	ResourceID    int64 `json:"resourceId" binding:"required"`
	ShareType     int8  `json:"shareType" binding:"required"`
	SharePerm     int8  `json:"sharePerm" binding:"required"`
	ExpireType    int8  `json:"expireType" binding:"required"`
}

// BatchCreateHandler 批量创建分享
func (h *ShareHandler) BatchCreateHandler(c *gin.Context) {
	var req BatchCreateShareReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	if len(req.Items) == 0 {
		response.Error(c, response.CodeBadRequest, "分享项不能为空")
		return
	}

	userID := c.GetInt64("user_id")

	items := make([]service.BatchShareItem, len(req.Items))
	for i, item := range req.Items {
		items[i] = service.BatchShareItem{
			ReceiveUserID: item.ReceiveUserID,
			ResourceID:    item.ResourceID,
			ShareType:     item.ShareType,
			SharePerm:     item.SharePerm,
			ExpireType:    item.ExpireType,
		}
	}

	results, err := h.ShareService.CreateBatchShare(userID, items)
	if err != nil {
		response.Error(c, response.CodeInternal, "批量创建分享失败")
		return
	}

	response.Success(c, results)
}

// handleShareError 统一处理分享相关错误
func handleShareError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrShareNotFound):
		response.Error(c, response.CodeNotFound, "分享记录不存在")
	case errors.Is(err, service.ErrShareExpired):
		response.Error(c, response.CodeBadRequest, "分享已过期")
	case errors.Is(err, service.ErrShareClosed):
		response.Error(c, response.CodeBadRequest, "分享已关闭")
	case errors.Is(err, service.ErrNoPermission):
		response.Error(c, response.CodeForbidden, "无权操作该分享")
	case errors.Is(err, service.ErrResourceNotFound):
		response.Error(c, response.CodeNotFound, "分享的资源不存在")
	case errors.Is(err, service.ErrShareAlreadyExists):
		response.Error(c, response.CodeBadRequest, "该资源已存在活跃分享")
	case errors.Is(err, service.ErrCannotShareToSelf):
		response.Error(c, response.CodeBadRequest, "不能分享给自己")
	default:
		response.Error(c, response.CodeInternal, "操作失败")
	}
}
