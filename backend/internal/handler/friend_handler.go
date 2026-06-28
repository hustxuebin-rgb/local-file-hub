package handler

import (
	"errors"
	"strconv"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// FriendHandler 好友处理器
type FriendHandler struct {
	FriendService *service.FriendService
}

// SendRequestReq 发送好友申请请求体
type SendRequestReq struct {
	ToUserID int64  `json:"toUserId" binding:"required"`
	Message  string `json:"message"`
}

// ======================== Handler 方法 ========================

// SearchUserHandler 搜索用户（用于添加好友）
func (h *FriendHandler) SearchUserHandler(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		q = c.Query("keyword")
	}
	if q == "" {
		response.Error(c, response.CodeBadRequest, "搜索关键词不能为空")
		return
	}

	currentUserID := c.GetInt64("user_id")

	results, err := h.FriendService.SearchUsers(q, currentUserID)
	if err != nil {
		response.Error(c, response.CodeInternal, "搜索用户失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"total": len(results),
		"list":  results,
	})
}

// SendRequestHandler 发送好友申请
func (h *FriendHandler) SendRequestHandler(c *gin.Context) {
	var req SendRequestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	fromUserID := c.GetInt64("user_id")

	friendReq, err := h.FriendService.SendRequest(fromUserID, req.ToUserID, req.Message)
	if err != nil {
		handleFriendError(c, err)
		return
	}

	response.SuccessWithMsg(c, "好友申请已发送", map[string]interface{}{
		"id": friendReq.ID,
	})
}

// ReceivedRequestsHandler 获取收到的好友申请列表
func (h *FriendHandler) ReceivedRequestsHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	status := parseFriendStatus(c.Query("status"))

	reqs, err := h.FriendService.GetReceivedRequests(userID, status)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取好友申请列表失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"total": len(reqs),
		"list":  reqs,
	})
}

// SentRequestsHandler 获取发出的好友申请列表
func (h *FriendHandler) SentRequestsHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	status := parseFriendStatus(c.Query("status"))

	reqs, err := h.FriendService.GetSentRequests(userID, status)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取好友申请列表失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"total": len(reqs),
		"list":  reqs,
	})
}

// AcceptRequestHandler 同意好友申请
func (h *FriendHandler) AcceptRequestHandler(c *gin.Context) {
	requestID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "申请ID格式错误")
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.FriendService.AcceptRequest(requestID, userID); err != nil {
		handleFriendError(c, err)
		return
	}

	response.SuccessWithMsg(c, "已同意好友申请", nil)
}

// RejectRequestHandler 拒绝好友申请
func (h *FriendHandler) RejectRequestHandler(c *gin.Context) {
	requestID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "申请ID格式错误")
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.FriendService.RejectRequest(requestID, userID); err != nil {
		handleFriendError(c, err)
		return
	}

	response.SuccessWithMsg(c, "已拒绝好友申请", nil)
}

// FriendListHandler 获取好友列表
func (h *FriendHandler) FriendListHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	friends, err := h.FriendService.GetFriendList(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取好友列表失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"total": len(friends),
		"list":  friends,
	})
}

// DeleteFriendHandler 删除好友
func (h *FriendHandler) DeleteFriendHandler(c *gin.Context) {
	friendID, err := strconv.ParseInt(c.Param("friendId"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "好友ID格式错误")
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.FriendService.DeleteFriend(userID, friendID); err != nil {
		handleFriendError(c, err)
		return
	}

	response.SuccessWithMsg(c, "已删除好友", nil)
}

// CheckFriendHandler 检查是否为好友
func (h *FriendHandler) CheckFriendHandler(c *gin.Context) {
	targetUserID, err := strconv.ParseInt(c.Param("userId"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "用户ID格式错误")
		return
	}

	userID := c.GetInt64("user_id")

	isFriend, err := h.FriendService.CheckFriend(userID, targetUserID)
	if err != nil {
		response.Error(c, response.CodeInternal, "检查好友关系失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"isFriend": isFriend,
	})
}

// ======================== 辅助函数 ========================

// parseFriendStatus 解析好友申请状态参数
func parseFriendStatus(statusStr string) *int8 {
	if statusStr == "" {
		return nil
	}
	v, err := strconv.Atoi(statusStr)
	if err != nil {
		return nil
	}
	status := int8(v)
	if status < model.FriendRequestPending || status > model.FriendRequestRejected {
		return nil
	}
	return &status
}

// handleFriendError 统一处理好友相关错误
func handleFriendError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrCannotAddSelf):
		response.Error(c, response.CodeBadRequest, "不能添加自己为好友")
	case errors.Is(err, service.ErrAlreadyFriend):
		response.Error(c, response.CodeBadRequest, "对方已是好友")
	case errors.Is(err, service.ErrRequestAlreadyExists):
		response.Error(c, response.CodeBadRequest, "已有待处理的好友申请")
	case errors.Is(err, service.ErrRequestNotFound):
		response.Error(c, response.CodeNotFound, "好友申请不存在")
	case errors.Is(err, service.ErrRequestAlreadyHandled):
		response.Error(c, response.CodeBadRequest, "好友申请已处理")
	case errors.Is(err, service.ErrNoPermissionToHandle):
		response.Error(c, response.CodeForbidden, "无权处理该申请")
	case errors.Is(err, gorm.ErrRecordNotFound):
		response.Error(c, response.CodeNotFound, "资源不存在")
	default:
		response.Error(c, response.CodeBadRequest, err.Error())
	}
}
