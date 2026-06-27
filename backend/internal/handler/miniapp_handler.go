package handler

import (
	"crypto/md5"
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// MiniappHandler 小程序处理器
type MiniappHandler struct{ StorageService *service.StorageService }

// AlbumUploadHandler 相册批量上传：接收小程序选择的多个文件，存储到用户私有目录
// 前端调用：Taro.uploadFile → multipart/form-data
func (h *MiniappHandler) AlbumUploadHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")

	// 接收上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.Error(c, response.CodeBadRequest, "未找到上传文件")
		return
	}
	defer file.Close()

	// 校验配额
	if err := h.StorageService.CheckSpace(userID, header.Size); err != nil {
		response.Error(c, response.CodeBadRequest, fmt.Sprintf("存储空间不足: %v", err))
		return
	}

	// 生成保存名称（使用原始文件名，重名时追加后缀）
	saveName := header.Filename
	ext := filepath.Ext(saveName)
	if ext == "" {
		ext = ".bin"
		saveName = saveName + ext
	}

	// 构建存储路径：user_storage/{storage_root}/{yyyy-mm}/{原始名}.ext
	user, err := h.StorageService.UserRepo.FindByID(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "用户不存在")
		return
	}

	dateDir := time.Now().Format("2006-01")
	disk, err := h.StorageService.GetActiveDisk()
	if err != nil {
		response.Error(c, response.CodeInternal, "存储盘不可用")
		return
	}

	destDir := filepath.Join(disk.DiskPath, "user_storage", user.StorageRoot, dateDir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		response.Error(c, response.CodeInternal, "创建存储目录失败")
		return
	}

	destPath := filepath.Join(destDir, saveName)

	// 重名检测：追加 (1) (2) 等后缀避免覆盖
	for counter := 1; ; counter++ {
		if _, err := os.Stat(destPath); os.IsNotExist(err) {
			break
		}
		base := strings.TrimSuffix(saveName, ext)
		saveName = fmt.Sprintf("%s(%d)%s", base, counter, ext)
		destPath = filepath.Join(destDir, saveName)
	}

	destFile, err := os.Create(destPath)
	if err != nil {
		response.Error(c, response.CodeInternal, "创建文件失败")
		return
	}
	defer destFile.Close()

	// 写入文件并计算MD5
	hash := md5.New()
	writer := io.MultiWriter(destFile, hash)
	written, err := io.Copy(writer, file)
	if err != nil {
		os.Remove(destPath)
		response.Error(c, response.CodeInternal, "存储文件失败")
		return
	}

	md5Hash := fmt.Sprintf("%x", hash.Sum(nil))

	// 检测文件类型
	fileType := int8(5) // 默认其他
	lowerExt := filepath.Ext(header.Filename)
	switch lowerExt {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico":
		fileType = 1 // 图片
	case ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v":
		fileType = 2 // 视频
	case ".mp3", ".wav", ".aac", ".flac", ".ogg", ".wma", ".m4a":
		fileType = 3 // 音频
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".md":
		fileType = 4 // 文档
	}

	// 创建文件记录
	now := time.Now()
	fileInfo := &model.FileInfo{
		UserID:       userID,
		FolderID:     0,
		FileName:     header.Filename,
		SaveName:     saveName,
		FileSuffix:   ext,
		FileType:     fileType,
		FileSize:     written,
		MD5:          md5Hash,
		FullPath:     destPath,
		SourceDevice: int8Ptr(2), // 小程序
		CreateTime:   now,
	}

	if err := h.StorageService.FileRepo.Create(fileInfo); err != nil {
		os.Remove(destPath)
		response.Error(c, response.CodeInternal, "创建文件记录失败")
		return
	}

	// 更新用户已用空间
	h.StorageService.UserRepo.UpdateUsedSize(userID, written)

	response.Success(c, map[string]interface{}{
		"fileId":   fileInfo.ID,
		"fileName": header.Filename,
		"fileSize": written,
		"md5":      md5Hash,
	})
}

// CameraUploadHandler 拍照上传：接收单张照片
func (h *MiniappHandler) CameraUploadHandler(c *gin.Context) {
	// 拍照上传流程与相册上传一致，复用相同逻辑
	h.AlbumUploadHandler(c)
}

// StorageStatHandler 存储统计
func (h *MiniappHandler) StorageStatHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	quota, err := h.StorageService.GetUserQuota(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取统计失败")
		return
	}
	response.Success(c, quota)
}

func randomUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func int8Ptr(v int8) *int8 { return &v }
