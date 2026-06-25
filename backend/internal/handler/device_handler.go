package handler

import (
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/pkg/response"
	"strconv"

	"github.com/gin-gonic/gin"
)

// DeviceHandler 设备处理器
type DeviceHandler struct{ DeviceRepo *repository.DeviceRepo }

// CurrentDeviceHandler 获取当前设备信息 GET /api/lan/current_device?device_type=1
func (h *DeviceHandler) CurrentDeviceHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	dt, _ := strconv.Atoi(c.Query("device_type"))
	device, err := h.DeviceRepo.FindByUserAndType(userID, int8(dt))
	if err != nil {
		response.Error(c, response.CodeInternal, "获取设备信息失败")
		return
	}
	response.Success(c, device)
}

// ServerInfoHandler 获取Server设备信息 GET /api/lan/server_info
func (h *DeviceHandler) ServerInfoHandler(c *gin.Context) {
	device, err := h.DeviceRepo.FindServerDevice()
	if err != nil {
		response.Error(c, response.CodeInternal, "获取Server信息失败")
		return
	}
	response.Success(c, device)
}

// KickReq 踢出设备请求
type KickReq struct {
	DeviceID int64 `json:"deviceId" binding:"required"`
}

// DeviceListHandler 在线设备列表
func (h *DeviceHandler) DeviceListHandler(c *gin.Context) {
	devices, err := h.DeviceRepo.FindOnlineDevices()
	if err != nil {
		response.Error(c, response.CodeInternal, "获取设备列表失败")
		return
	}
	response.Success(c, devices)
}

// DeviceKickHandler 强制踢出设备
func (h *DeviceHandler) DeviceKickHandler(c *gin.Context) {
	var req KickReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}
	if err := h.DeviceRepo.DeleteByID(req.DeviceID); err != nil {
		response.Error(c, response.CodeInternal, "踢出失败")
		return
	}
	response.SuccessWithMsg(c, "设备已强制下线", nil)
}
