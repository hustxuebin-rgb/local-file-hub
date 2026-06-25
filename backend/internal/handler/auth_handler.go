package handler

import (
	"strings"

	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// AuthHandler 认证处理器
type AuthHandler struct{ AuthService *service.AuthService }

// LoginReq 登录请求
type LoginReq struct {
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	DeviceType int8   `json:"deviceType" binding:"required"`
	DeviceName string `json:"deviceName"`
	LocalIP    string `json:"localIp"`
}

// LoginHandler 登录处理
func (h *AuthHandler) LoginHandler(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}
	if req.LocalIP == "" {
		req.LocalIP = c.ClientIP()
	}

	resp, err := h.AuthService.Login(req.Username, req.Password, req.DeviceType, req.DeviceName, req.LocalIP)
	if err != nil {
		response.Error(c, response.CodeUnauthorized, err.Error())
		return
	}
	response.Success(c, resp)
}

// LogoutHandler 退出处理
func (h *AuthHandler) LogoutHandler(c *gin.Context) {
	token := extractToken(c)
	if token == "" {
		response.Error(c, response.CodeBadRequest, "未提供token")
		return
	}
	if err := h.AuthService.Logout(token); err != nil {
		response.Error(c, response.CodeInternal, "退出失败")
		return
	}
	response.SuccessWithMsg(c, "已退出登录", nil)
}

// CurrentUserHandler 获取当前用户信息
func (h *AuthHandler) CurrentUserHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id := userID.(int64)
	user, err := h.AuthService.GetCurrentUser(id)
	if err != nil {
		response.Error(c, response.CodeNotFound, "用户不存在")
		return
	}
	response.Success(c, user)
}

// extractToken 从 Authorization 头提取 Bearer token
func extractToken(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) == 2 && parts[0] == "Bearer" {
		return parts[1]
	}
	return ""
}
