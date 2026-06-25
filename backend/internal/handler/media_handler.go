package handler

import (
	"os"
	"strconv"

	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// MediaHandler 媒体处理器
type MediaHandler struct{ FileRepo *repository.FileRepo }

// ThumbnailHandler 获取缩略图
func (h *MediaHandler) ThumbnailHandler(c *gin.Context) {
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	file, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		response.Error(c, response.CodeNotFound, "文件不存在")
		return
	}
	userID := c.GetInt64("user_id")
	if file.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权访问该文件")
		return
	}
	if file.ThumbnailPath != nil && *file.ThumbnailPath != "" {
		c.File(*file.ThumbnailPath)
		return
	}
	c.File(file.FullPath)
}

// VideoPreviewHandler 视频预览
func (h *MediaHandler) VideoPreviewHandler(c *gin.Context) {
	fileID, _ := strconv.ParseInt(c.Param("fileId"), 10, 64)
	file, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		response.Error(c, response.CodeNotFound, "文件不存在")
		return
	}
	userID := c.GetInt64("user_id")
	if file.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权访问该文件")
		return
	}
	if _, err := os.Stat(file.FullPath); os.IsNotExist(err) {
		response.Error(c, response.CodeNotFound, "文件不存在")
		return
	}
	c.File(file.FullPath)
}
