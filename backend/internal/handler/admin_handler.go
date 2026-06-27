package handler

import (
	"errors"
	"fmt"
	"strconv"
	"time"

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

// UserListResp 用户列表分页响应
type UserListResp struct {
	List  []model.SysUser `json:"list"`
	Total int64           `json:"total"`
}

// UserListHandler 获取用户列表（分页）
func (h *AdminHandler) UserListHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	keyword := c.Query("keyword")

	query := h.DB.Model(&model.SysUser{})
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("username LIKE ? OR nickname LIKE ?", like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		response.Error(c, response.CodeInternal, "查询用户总数失败")
		return
	}

	var users []model.SysUser
	offset := (page - 1) * pageSize
	if err := query.Offset(offset).Limit(pageSize).Order("id DESC").Find(&users).Error; err != nil {
		response.Error(c, response.CodeInternal, "查询用户列表失败")
		return
	}

	response.Success(c, UserListResp{List: users, Total: total})
}

// AddUserReq 添加用户请求体
type AddUserReq struct {
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password" binding:"required"`
	Nickname     string `json:"nickname" binding:"required"`
	Role         int8   `json:"role"`
	DiskID       *int64 `json:"diskId"`
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

	// 生成 StorageRoot
	timestamp := time.Now().UnixNano()
	storageRoot := fmt.Sprintf("user_%s_%d", req.Username, timestamp)
	if req.DiskID != nil && *req.DiskID > 0 {
		var disk model.StorageDisk
		if err := h.DB.First(&disk, *req.DiskID).Error; err != nil {
			response.Error(c, response.CodeBadRequest, "指定的存储盘不存在")
			return
		}
		storageRoot = fmt.Sprintf("%s/user_%s_%d", disk.DiskPath, req.Username, timestamp)
	}

	quotaMB := req.StorageQuota
	if quotaMB <= 0 {
		quotaMB = 100 * 1024 // 默认100GB = 102400 MB
	}

	user := &model.SysUser{
		Username:     req.Username,
		Password:     string(hashedPassword),
		Nickname:     req.Nickname,
		Role:         req.Role,
		DiskID:       req.DiskID,
		StorageQuota: quotaMB * 1024 * 1024, // 前端传MB，转为bytes存储
		StorageRoot:  storageRoot,
	}

	if err := h.UserRepo.Create(user); err != nil {
		response.Error(c, response.CodeInternal, "创建用户失败")
		return
	}

	response.SuccessWithMsg(c, "用户创建成功", nil)
}

// UpdateUserHandler 更新用户（白名单模式，仅允许修改 nickname/storageQuota/status/role）
func (h *AdminHandler) UpdateUserHandler(c *gin.Context) {
	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "用户ID格式错误")
		return
	}

	// 校验用户是否存在
	var existing model.SysUser
	if err := h.DB.First(&existing, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "用户不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询用户失败")
		return
	}

	var req struct {
		Nickname     *string `json:"nickname"`
		StorageQuota *int64  `json:"storageQuota"`
		Status       *int8   `json:"status"`
		Role         *int8   `json:"role"`
		DiskID       *int64  `json:"diskId"`
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
		updates["storage_quota"] = *req.StorageQuota * 1024 * 1024 // 前端传MB，转为bytes存储
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Role != nil {
		updates["role"] = *req.Role
	}
	if req.DiskID != nil {
		updates["disk_id"] = *req.DiskID
		// 换盘时同步更新 storage_root
		if *req.DiskID > 0 {
			var disk model.StorageDisk
			if err := h.DB.First(&disk, *req.DiskID).Error; err == nil {
				updates["storage_root"] = disk.DiskPath + "/user_" + existing.Username + "_" + strconv.FormatInt(time.Now().UnixNano(), 10)
			}
		}
	}
	if len(updates) == 0 {
		response.Error(c, response.CodeBadRequest, "没有需要更新的字段")
		return
	}
	result := h.DB.Model(&model.SysUser{}).Where("id = ?", userID).Updates(updates)
	if result.Error != nil {
		response.Error(c, response.CodeInternal, "更新用户失败")
		return
	}
	if result.RowsAffected == 0 {
		response.Error(c, response.CodeNotFound, "用户不存在")
		return
	}
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
