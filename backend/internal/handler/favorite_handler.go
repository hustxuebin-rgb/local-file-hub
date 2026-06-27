package handler

import (
	"errors"
	"strconv"
	"strings"

	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// FavoriteHandler 收藏处理器
type FavoriteHandler struct {
	FavoriteService *service.FavoriteService
}

// AddFavoriteReq 添加收藏请求体
type AddFavoriteReq struct {
	TargetType int8  `json:"targetType" binding:"required"`
	TargetID   int64 `json:"targetId" binding:"required"`
}

// RemoveFavoriteReq 取消收藏请求体
type RemoveFavoriteReq struct {
	TargetType int8  `json:"targetType" binding:"required"`
	TargetID   int64 `json:"targetId" binding:"required"`
}

// AddFavorite 添加收藏
func (h *FavoriteHandler) AddFavorite(c *gin.Context) {
	var req AddFavoriteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.FavoriteService.AddFavorite(userID, req.TargetType, req.TargetID); err != nil {
		handleFavoriteError(c, err)
		return
	}

	response.SuccessWithMsg(c, "收藏成功", nil)
}

// RemoveFavorite 取消收藏
func (h *FavoriteHandler) RemoveFavorite(c *gin.Context) {
	var req RemoveFavoriteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.FavoriteService.RemoveFavorite(userID, req.TargetType, req.TargetID); err != nil {
		handleFavoriteError(c, err)
		return
	}

	response.SuccessWithMsg(c, "已取消收藏", nil)
}

// ListFavorites 获取收藏列表
func (h *FavoriteHandler) ListFavorites(c *gin.Context) {
	userID := c.GetInt64("user_id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	keyword := c.Query("keyword")
	targetTypeStr := c.Query("targetType")
	var targetType *int8
	if targetTypeStr != "" {
		if v, err := strconv.Atoi(targetTypeStr); err == nil {
			tv := int8(v)
			targetType = &tv
		}
	}

	sortBy := c.DefaultQuery("sortBy", "createTime")
	sortOrder := c.DefaultQuery("sortOrder", "desc")

	// 白名单校验，防止 SQL 注入
	allowedSortFields := map[string]bool{
		"targetName": true,
		"createTime": true,
		"targetSize": true,
	}
	if !allowedSortFields[sortBy] {
		sortBy = "createTime"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	// 映射客户端排序字段到数据库字段标识，供 repo 层安全拼接 ORDER BY
	var dbSortField string
	switch sortBy {
	case "targetName":
		dbSortField = "target_name"
	case "targetSize":
		dbSortField = "target_size"
	default:
		dbSortField = "favorite.create_time"
	}

	list, total, err := h.FavoriteService.GetFavorites(userID, page, pageSize, keyword, targetType, dbSortField, sortOrder)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取收藏列表失败")
		return
	}

	response.Success(c, map[string]interface{}{
		"total": total,
		"list":  list,
	})
}

// handleFavoriteError 统一处理收藏相关错误
func handleFavoriteError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrFavoriteAlreadyExists):
		response.Error(c, response.CodeBadRequest, "已收藏")
	case errors.Is(err, service.ErrFavoriteNotFound):
		response.Error(c, response.CodeNotFound, "收藏不存在")
	case errors.Is(err, gorm.ErrRecordNotFound):
		response.Error(c, response.CodeNotFound, "资源不存在")
	case strings.Contains(err.Error(), "不存在"):
		response.Error(c, response.CodeNotFound, err.Error())
	case strings.Contains(err.Error(), "已被删除"):
		response.Error(c, response.CodeNotFound, err.Error())
	case strings.Contains(err.Error(), "无效的"):
		response.Error(c, response.CodeBadRequest, err.Error())
	default:
		response.Error(c, response.CodeBadRequest, "操作失败，请稍后重试")
	}
}
