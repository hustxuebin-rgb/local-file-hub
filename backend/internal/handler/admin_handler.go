package handler

import (
	"strconv"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AdminHandler 管理员处理器
type AdminHandler struct {
	DB          *gorm.DB
	AuthService *service.AuthService
	UserRepo    *repository.UserRepo
}

// UserListHandler 获取用户列表
func (h *AdminHandler) UserListHandler(c *gin.Context) {
	var users []model.SysUser
	h.DB.Find(&users)
	response.Success(c, users)
}

// AddUserReq 添加用户请求体
type AddUserReq struct {
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password" binding:"required"`
	Nickname     string `json:"nickname" binding:"required"`
	StorageQuota int64  `json:"storageQuota"`
}

// AddUserHandler 添加用户
func (h *AdminHandler) AddUserHandler(c *gin.Context) {
	var req AddUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.Error(c, response.CodeInternal, "密码加密失败")
		return
	}

	user := &model.SysUser{
		Username:     req.Username,
		Password:     string(hashedPassword),
		Nickname:     req.Nickname,
		StorageQuota: req.StorageQuota,
	}

	if err := h.UserRepo.Create(user); err != nil {
		response.Error(c, response.CodeInternal, "创建用户失败")
		return
	}

	response.SuccessWithMsg(c, "用户创建成功", nil)
}

// UpdateUserHandler 更新用户（白名单模式，仅允许修改 nickname/storageQuota/status）
func (h *AdminHandler) UpdateUserHandler(c *gin.Context) {
	userID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var req struct {
		Nickname     *string `json:"nickname"`
		StorageQuota *int64  `json:"storageQuota"`
		Status       *int8   `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}

	updates := map[string]interface{}{}
	if req.Nickname != nil {
		updates["nickname"] = *req.Nickname
	}
	if req.StorageQuota != nil {
		updates["storage_quota"] = *req.StorageQuota
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if len(updates) == 0 {
		response.Error(c, response.CodeBadRequest, "没有需要更新的字段")
		return
	}
	h.DB.Model(&model.SysUser{}).Where("id = ?", userID).Updates(updates)
	response.SuccessWithMsg(c, "更新成功", nil)
}

// DeleteUserHandler 删除用户（软禁用）
func (h *AdminHandler) DeleteUserHandler(c *gin.Context) {
	userID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	currentUserID := c.GetInt64("user_id")
	if currentUserID == userID {
		response.Error(c, response.CodeBadRequest, "不能禁用自己")
		return
	}
	h.DB.Model(&model.SysUser{}).Where("id = ?", userID).Update("status", 0)
	response.SuccessWithMsg(c, "用户已禁用", nil)
}

// StorageStatHandler 存储统计
func (h *AdminHandler) StorageStatHandler(c *gin.Context) {
	var users []model.SysUser
	h.DB.Select("id, username, nickname, storage_quota, used_size, storage_root").Find(&users)
	response.Success(c, users)
}

// SearchUserHandler 搜索用户
func (h *AdminHandler) SearchUserHandler(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		q = c.Query("keyword")
	}
	var users []model.SysUser
	h.DB.Where("username LIKE ? OR nickname LIKE ?", "%"+q+"%", "%"+q+"%").Limit(20).Find(&users)
	response.Success(c, users)
}
