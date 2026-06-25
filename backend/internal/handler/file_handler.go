package handler

import (
	"errors"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// FileHandler 文件处理器
type FileHandler struct {
	UploadService    *service.UploadService
	FileRepo         *repository.FileRepo
	StorageService   *service.StorageService
	OperationLogRepo *repository.OperationLogRepo
	UserRepo         *repository.UserRepo
}

// ==================== 请求体定义 ====================

// UploadInitReq 初始化上传请求
type UploadInitReq struct {
	FileName string `json:"fileName" binding:"required"`
	FileSize int64  `json:"fileSize" binding:"required"`
	FileMD5  string `json:"md5"`
	FolderID int64  `json:"folderId"`
}

// UploadMergeReq 合并上传请求
type UploadMergeReq struct {
	TaskID          string `json:"taskId" binding:"required"`
	OverwriteFileID int64  `json:"overwriteFileId"` // 覆盖目标文件ID，0=不覆盖
}

// UploadCancelReq 取消上传请求
type UploadCancelReq struct {
	TaskID string `json:"taskId" binding:"required"`
}

// MoveFileReq 移动文件请求
type MoveFileReq struct {
	FileID         int64 `json:"fileId" binding:"required"`
	TargetFolderID int64 `json:"targetFolderId" binding:"required"`
}

// RecycleRecoverReq 回收站恢复请求
type RecycleRecoverReq struct {
	FileID int64 `json:"fileId" binding:"required"`
}

// RecycleDeleteReq 回收站彻底删除请求
type RecycleDeleteReq struct {
	FileID int64 `json:"fileId" binding:"required"`
}

// ==================== 响应体定义 ====================

// FileInfoResp 文件信息响应
type FileInfoResp struct {
	ID         int64  `json:"id"`
	UserID     int64  `json:"userId"`
	FolderID   int64  `json:"folderId"`
	FileName   string `json:"fileName"`
	FileSuffix string `json:"fileSuffix"`
	FileType   int8   `json:"fileType"`
	FileSize   int64  `json:"fileSize"`
	MimeType   string `json:"mimeType"`
	MD5        string `json:"md5"`
	FullPath   string `json:"fullPath"`
	IsDelete   int8   `json:"isDelete"`
	CreateTime string `json:"createTime"`
}

// ListResp 文件列表响应
type ListResp struct {
	Total int64          `json:"total"`
	List  []FileInfoResp `json:"list"`
}

// toFileInfoResp 将 model.FileInfo 转换为响应结构
func toFileInfoResp(f *model.FileInfo) FileInfoResp {
	mimeType := ""
	if f.MimeType != nil {
		mimeType = *f.MimeType
	}
	return FileInfoResp{
		ID:         f.ID,
		UserID:     f.UserID,
		FolderID:   f.FolderID,
		FileName:   f.FileName,
		FileSuffix: f.FileSuffix,
		FileType:   f.FileType,
		FileSize:   f.FileSize,
		MimeType:   mimeType,
		MD5:        f.MD5,
		FullPath:   f.FullPath,
		IsDelete:   f.IsDelete,
		CreateTime: f.CreateTime.Format("2006-01-02 15:04:05"),
	}
}

// ==================== 上传相关 Handler ====================

// UploadInit 初始化上传
func (h *FileHandler) UploadInit(c *gin.Context) {
	var req UploadInitReq
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("upload init bind error: %v", err)
		response.Error(c, response.CodeBadRequest, "请求参数错误")
		return
	}

	userID := c.GetInt64("user_id")

	resp, err := h.UploadService.InitUpload(userID, req.FileName, req.FileSize, req.FileMD5, req.FolderID)
	if err != nil {
		log.Printf("upload init error: %v", err)
		response.Error(c, response.CodeInternal, "初始化上传失败")
		return
	}

	if resp.QuickDone {
		h.logOperation(c, userID, 6, 1, &resp.FileID, "秒传文件: "+req.FileName)
	} else {
		h.logOperation(c, userID, 6, 1, nil, "开始上传: "+req.FileName)
	}

	response.Success(c, resp)
}

// UploadChunk 上传分块
func (h *FileHandler) UploadChunk(c *gin.Context) {
	taskID := c.PostForm("taskId")
	if taskID == "" {
		response.Error(c, response.CodeBadRequest, "缺少taskId参数")
		return
	}

	chunkIndexStr := c.PostForm("chunkIndex")
	if chunkIndexStr == "" {
		response.Error(c, response.CodeBadRequest, "缺少chunkIndex参数")
		return
	}
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "chunkIndex参数格式错误")
		return
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		log.Printf("upload chunk formfile error: %v", err)
		response.Error(c, response.CodeBadRequest, "读取分块文件失败")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		response.Error(c, response.CodeInternal, "读取分块数据失败")
		return
	}

	if err := h.UploadService.CreateChunk(taskID, chunkIndex, data); err != nil {
		log.Printf("upload chunk error: %v", err)
		response.Error(c, response.CodeInternal, "写入分块失败")
		return
	}

	response.SuccessWithMsg(c, "分块上传成功", nil)
}

// UploadMerge 合并分块
func (h *FileHandler) UploadMerge(c *gin.Context) {
	var req UploadMergeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("upload merge bind error: %v", err)
		response.Error(c, response.CodeBadRequest, "请求参数错误")
		return
	}

	userID := c.GetInt64("user_id")

	// 校验 task 归属权
	task, err := h.UploadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		log.Printf("upload merge: task ownership mismatch, userID=%d", userID)
		response.Error(c, response.CodeForbidden, "无权操作此上传任务")
		return
	}

	fileInfo, err := h.UploadService.MergeChunks(req.TaskID, req.OverwriteFileID)
	if err != nil {
		log.Printf("upload merge error: %v", err)
		response.Error(c, response.CodeInternal, "合并文件失败")
		return
	}

	h.logOperation(c, userID, 6, 1, &fileInfo.ID, "上传完成: "+fileInfo.FileName)
	response.Success(c, toFileInfoResp(fileInfo))
}

// UploadCancel 取消上传
func (h *FileHandler) UploadCancel(c *gin.Context) {
	var req UploadCancelReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	if err := h.UploadService.CancelUpload(req.TaskID); err != nil {
		response.Error(c, response.CodeInternal, "取消上传失败: "+err.Error())
		return
	}

	h.logOperation(c, userID, 6, 1, nil, "取消上传: taskID="+req.TaskID)
	response.SuccessWithMsg(c, "已取消上传", nil)
}

// ==================== 文件管理 Handler ====================

// List 文件列表
func (h *FileHandler) List(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var folderID int64
	if fid := c.Query("folderId"); fid != "" {
		var err error
		folderID, err = strconv.ParseInt(fid, 10, 64)
		if err != nil {
			response.Error(c, response.CodeBadRequest, "folderId参数格式错误")
			return
		}
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	files, total, err := h.FileRepo.FindByUserAndFolder(userID, folderID, offset, pageSize)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取文件列表失败")
		return
	}

	list := make([]FileInfoResp, 0, len(files))
	for i := range files {
		list = append(list, toFileInfoResp(&files[i]))
	}

	response.Success(c, ListResp{Total: total, List: list})
}

// Info 文件详情
func (h *FileHandler) Info(c *gin.Context) {
	userID := c.GetInt64("user_id")

	fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	fileInfo, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权查看该文件")
		return
	}

	response.Success(c, toFileInfoResp(fileInfo))
}

// Download 下载文件
func (h *FileHandler) Download(c *gin.Context) {
	userID := c.GetInt64("user_id")

	fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	fileInfo, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权下载该文件")
		return
	}

	if fileInfo.IsDelete == 1 {
		response.Error(c, response.CodeNotFound, "文件已被删除")
		return
	}

	h.logOperation(c, userID, 3, 1, &fileInfo.ID, "下载文件: "+fileInfo.FileName)

	c.FileAttachment(fileInfo.FullPath, fileInfo.FileName)
}

// Preview 预览文件
func (h *FileHandler) Preview(c *gin.Context) {
	userID := c.GetInt64("user_id")

	fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	fileInfo, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权预览该文件")
		return
	}

	if fileInfo.IsDelete == 1 {
		response.Error(c, response.CodeNotFound, "文件已被删除")
		return
	}

	// 图片类型使用 inline 方式返回
	mimeType := "application/octet-stream"
	if fileInfo.MimeType != nil {
		mimeType = *fileInfo.MimeType
	}

	if strings.HasPrefix(mimeType, "image/") || mimeType == "application/pdf" {
		c.File(fileInfo.FullPath)
		return
	}

	c.Header("Content-Type", mimeType)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, fileInfo.FileName))
	c.File(fileInfo.FullPath)
}

// Delete 删除文件（移入回收站）
func (h *FileHandler) Delete(c *gin.Context) {
	userID := c.GetInt64("user_id")

	fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	fileInfo, err := h.FileRepo.FindByID(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权删除该文件")
		return
	}

	if fileInfo.IsDelete == 1 {
		response.Error(c, response.CodeBadRequest, "文件已在回收站中")
		return
	}

	if err := h.FileRepo.SoftDelete(fileID); err != nil {
		response.Error(c, response.CodeInternal, "删除文件失败")
		return
	}

	// 更新用户已用空间（减少）
	h.UserRepo.UpdateUsedSize(userID, -fileInfo.FileSize)

	h.logOperation(c, userID, 4, 1, &fileInfo.ID, "删除文件: "+fileInfo.FileName)
	response.SuccessWithMsg(c, "文件已移入回收站", nil)
}

// Move 移动文件
func (h *FileHandler) Move(c *gin.Context) {
	var req MoveFileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	fileInfo, err := h.FileRepo.FindByID(req.FileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权移动该文件")
		return
	}

	if fileInfo.IsDelete == 1 {
		response.Error(c, response.CodeBadRequest, "文件在回收站中，无法移动")
		return
	}

	// 更新文件夹ID
	fileInfo.FolderID = req.TargetFolderID
	if err := h.FileRepo.Update(fileInfo); err != nil {
		response.Error(c, response.CodeInternal, "移动文件失败")
		return
	}

	h.logOperation(c, userID, 5, 1, &fileInfo.ID, fmt.Sprintf("移动文件: %s → folderID=%d", fileInfo.FileName, req.TargetFolderID))
	response.Success(c, toFileInfoResp(fileInfo))
}

// ==================== 回收站 Handler ====================

// RecycleList 回收站列表
func (h *FileHandler) RecycleList(c *gin.Context) {
	userID := c.GetInt64("user_id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	files, total, err := h.FileRepo.FindRecycleByUser(userID, offset, pageSize)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取回收站列表失败")
		return
	}

	list := make([]FileInfoResp, 0, len(files))
	for i := range files {
		list = append(list, toFileInfoResp(&files[i]))
	}

	response.Success(c, ListResp{Total: total, List: list})
}

// RecycleRecover 从回收站恢复文件
func (h *FileHandler) RecycleRecover(c *gin.Context) {
	var req RecycleRecoverReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	fileInfo, err := h.FileRepo.FindByID(req.FileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权恢复该文件")
		return
	}

	if fileInfo.IsDelete == 0 {
		response.Error(c, response.CodeBadRequest, "文件不在回收站中")
		return
	}

	if err := h.FileRepo.Recover(req.FileID); err != nil {
		response.Error(c, response.CodeInternal, "恢复文件失败")
		return
	}

	// 更新用户已用空间（恢复）
	h.UserRepo.UpdateUsedSize(userID, fileInfo.FileSize)

	h.logOperation(c, userID, 7, 1, &fileInfo.ID, "恢复文件: "+fileInfo.FileName)
	response.SuccessWithMsg(c, "文件已恢复", nil)
}

// RecycleDelete 彻底删除文件
func (h *FileHandler) RecycleDelete(c *gin.Context) {
	var req RecycleDeleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	fileInfo, err := h.FileRepo.FindByID(req.FileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件失败")
		return
	}

	if fileInfo.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权删除该文件")
		return
	}

	if fileInfo.IsDelete == 0 {
		response.Error(c, response.CodeBadRequest, "请先将文件移入回收站")
		return
	}

	// 物理删除文件记录
	if err := h.FileRepo.HardDelete(req.FileID); err != nil {
		response.Error(c, response.CodeInternal, "删除文件失败")
		return
	}

	h.logOperation(c, userID, 8, 1, &fileInfo.ID, "彻底删除文件: "+fileInfo.FileName)
	response.SuccessWithMsg(c, "文件已彻底删除", nil)
}

// ==================== 辅助函数 ====================

// logOperation 记录操作日志
func (h *FileHandler) logOperation(c *gin.Context, userID int64, operType int8, resourceType int8, resourceID *int64, desc string) {
	now := time.Now()
	logEntry := &model.SysOperationLog{
		UserID:       &userID,
		OperType:     operType,
		ResourceType: &resourceType,
		ResourceID:   resourceID,
		OperDesc:     desc,
		LocalIP:      c.ClientIP(),
		CreateTime:   now,
	}
	_ = h.OperationLogRepo.Create(logEntry)
}

// getMimeType 根据文件扩展名返回MIME类型
func getMimeType(fileName string) string {
	ext := strings.ToLower(filepath.Ext(fileName))
	mimeTypes := map[string]string{
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".gif":  "image/gif",
		".bmp":  "image/bmp",
		".webp": "image/webp",
		".svg":  "image/svg+xml",
		".ico":  "image/x-icon",
		".mp4":  "video/mp4",
		".avi":  "video/x-msvideo",
		".mov":  "video/quicktime",
		".mkv":  "video/x-matroska",
		".webm": "video/webm",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".aac":  "audio/aac",
		".flac": "audio/flac",
		".ogg":  "audio/ogg",
		".pdf":  "application/pdf",
		".doc":  "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xls":  "application/vnd.ms-excel",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".ppt":  "application/vnd.ms-powerpoint",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		".txt":  "text/plain",
		".csv":  "text/csv",
		".md":   "text/markdown",
		".zip":  "application/zip",
		".rar":  "application/x-rar-compressed",
		".7z":   "application/x-7z-compressed",
	}
	if mime, ok := mimeTypes[ext]; ok {
		return mime
	}
	return "application/octet-stream"
}
