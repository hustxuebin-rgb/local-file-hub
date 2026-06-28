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
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/errgroup"
	"gorm.io/gorm"
)

// FileHandler 文件处理器
type FileHandler struct {
	UploadService    *service.UploadService
	DownloadService  *service.DownloadService
	FileRepo         *repository.FileRepo
	StorageService   *service.StorageService
	OperationLogRepo *repository.OperationLogRepo
	UserRepo         *repository.UserRepo
	UploadTaskRepo   *repository.UploadTaskRepo
}

// ==================== 请求体定义 ====================

// UploadInitReq 初始化上传请求
type UploadInitReq struct {
	FileName   string `json:"fileName" binding:"required"`
	FileSize   int64  `json:"fileSize" binding:"required"`
	FileMD5    string `json:"md5"`
	FilePath   string `json:"filePath"`
	FolderID   int64  `json:"folderId"`
	Visibility int8   `json:"visibility"`
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

// UploadPauseReq 暂停上传请求
type UploadPauseReq struct {
	TaskID string `json:"taskId" binding:"required"`
}

// DownloadInitReq 初始化下载请求
type DownloadInitReq struct {
	FileID int64 `json:"fileId" binding:"required"`
}

// DownloadTaskReq 下载任务操作请求（暂停/恢复/取消）
type DownloadTaskReq struct {
	TaskID string `json:"taskId" binding:"required"`
}

// DownloadListResp 下载任务列表响应
type DownloadListResp struct {
	Items    []*model.DownloadTask `json:"items"`
	Total    int64                 `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"pageSize"`
}

// TasksListResp 统一任务列表响应
type TasksListResp struct {
	UploadTasks   []*model.UploadTask   `json:"uploadTasks"`
	DownloadTasks []*model.DownloadTask `json:"downloadTasks"`
}

// TasksHistoryReq 历史任务查询参数
type TasksHistoryReq struct {
	Type     string `form:"type"`     // upload|download
	Status   string `form:"status"`   // 逗号分隔的状态值
	Keyword  string `form:"keyword"`  // 文件名模糊搜索
	Page     int    `form:"page"`     // 页码
	PageSize int    `form:"pageSize"` // 每页数量
}

// TasksHistoryResp 历史任务分页响应
type TasksHistoryResp struct {
	Items    interface{} `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

// TaskStatsItem 单个统计项
type TaskStatsItem struct {
	Count     int64 `json:"count"`
	TotalSize int64 `json:"totalSize"`
	AvgSpeed  int64 `json:"avgSpeed"`
}

// TasksStatsResp 今日统计响应
type TasksStatsResp struct {
	Upload   *TaskStatsItem `json:"upload"`
	Download *TaskStatsItem `json:"download"`
}

// TasksBatchReq 批量操作请求
type TasksBatchReq struct {
	TaskType string   `json:"taskType" binding:"required"` // upload|download
	Action   string   `json:"action" binding:"required"`   // pause|resume|cancel
	TaskIDs  []string `json:"taskIds" binding:"required"`  // 任务ID列表
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
	ID           int64  `json:"id"`
	UserID       int64  `json:"userId"`
	FolderID     int64  `json:"folderId"`
	FileName     string `json:"fileName"`
	FileSuffix   string `json:"fileSuffix"`
	FileType     int8   `json:"fileType"`
	FileSize     int64  `json:"fileSize"`
	MimeType     string `json:"mimeType"`
	MD5          string `json:"md5"`
	FullPath     string `json:"fullPath"`
	Visibility   int8   `json:"visibility"`
	IsDelete     int8   `json:"isDelete"`
	CreateTime   string `json:"createTime"`
	UploaderName string `json:"uploaderName,omitempty"`
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
		Visibility: f.Visibility,
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

	resp, err := h.UploadService.InitUpload(userID, req.FileName, req.FileSize, req.FileMD5, req.FilePath, req.FolderID, req.Visibility)
	if err != nil {
		log.Printf("upload init error: %v", err)
		response.Error(c, response.CodeInternal, "初始化上传失败")
		return
	}

	if resp.QuickDone {
		h.logOperation(c, userID, OperTypeUpload, 1, &resp.FileID, "秒传文件: "+req.FileName)
	} else {
		h.logOperation(c, userID, OperTypeUpload, 1, nil, "开始上传: "+req.FileName)
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

	h.logOperation(c, userID, OperTypeUpload, 1, &fileInfo.ID, "上传完成: "+fileInfo.FileName)
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

	h.logOperation(c, userID, OperTypeUpload, 1, nil, "取消上传: taskID="+req.TaskID)
	response.SuccessWithMsg(c, "已取消上传", nil)
}

// UploadStatus 查询上传状态
func (h *FileHandler) UploadStatus(c *gin.Context) {
	taskID := c.Query("taskId")
	if taskID == "" {
		response.Error(c, response.CodeBadRequest, "缺少taskId参数")
		return
	}

	resp, err := h.UploadService.GetUploadStatus(taskID)
	if err != nil {
		log.Printf("upload status error: %v", err)
		response.Error(c, response.CodeNotFound, "查询上传状态失败")
		return
	}

	response.Success(c, resp)
}

// UploadPause 暂停上传
func (h *FileHandler) UploadPause(c *gin.Context) {
	var req UploadPauseReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	// 校验任务归属权
	task, err := h.UploadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此上传任务")
		return
	}

	if err := h.UploadService.PauseUpload(req.TaskID); err != nil {
		log.Printf("upload pause error: %v", err)
		response.Error(c, response.CodeInternal, "暂停上传失败")
		return
	}

	response.SuccessWithMsg(c, "已暂停上传", nil)
}

// UploadResume 恢复上传
func (h *FileHandler) UploadResume(c *gin.Context) {
	var req UploadPauseReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	// 校验任务归属权
	task, err := h.UploadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此上传任务")
		return
	}

	resp, err := h.UploadService.ResumeUpload(req.TaskID)
	if err != nil {
		log.Printf("upload resume error: %v", err)
		response.Error(c, response.CodeInternal, "恢复上传失败")
		return
	}

	response.Success(c, resp)
}

// UploadUnfinished 获取用户未完成上传任务列表
func (h *FileHandler) UploadUnfinished(c *gin.Context) {
	userID := c.GetInt64("user_id")

	tasks, err := h.UploadService.GetUnfinishedTasks(userID)
	if err != nil {
		log.Printf("upload unfinished error: %v", err)
		response.Error(c, response.CodeInternal, "获取未完成任务失败")
		return
	}

	response.Success(c, tasks)
}

// DownloadInit 初始化下载任务
func (h *FileHandler) DownloadInit(c *gin.Context) {
	var req DownloadInitReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	resp, err := h.DownloadService.InitDownload(userID, req.FileID)
	if err != nil {
		log.Printf("download init error: %v", err)
		response.Error(c, response.CodeInternal, "初始化下载失败")
		return
	}

	response.Success(c, resp)
}

// DownloadStatus 查询下载任务状态
func (h *FileHandler) DownloadStatus(c *gin.Context) {
	taskID := c.Query("taskId")
	if taskID == "" {
		response.Error(c, response.CodeBadRequest, "缺少taskId参数")
		return
	}

	userID := c.GetInt64("user_id")

	task, err := h.DownloadService.GetTask(taskID)
	if err != nil {
		log.Printf("download status error: %v", err)
		response.Error(c, response.CodeNotFound, "下载任务不存在")
		return
	}

	if task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此下载任务")
		return
	}

	response.Success(c, task)
}

// DownloadPause 暂停下载
func (h *FileHandler) DownloadPause(c *gin.Context) {
	var req DownloadTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	task, err := h.DownloadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此下载任务")
		return
	}

	if err := h.DownloadService.PauseDownload(req.TaskID); err != nil {
		log.Printf("download pause error: %v", err)
		response.Error(c, response.CodeInternal, "暂停下载失败")
		return
	}

	response.SuccessWithMsg(c, "已暂停下载", nil)
}

// DownloadResume 恢复下载
func (h *FileHandler) DownloadResume(c *gin.Context) {
	var req DownloadTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	task, err := h.DownloadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此下载任务")
		return
	}

	if err := h.DownloadService.ResumeDownload(req.TaskID); err != nil {
		log.Printf("download resume error: %v", err)
		response.Error(c, response.CodeInternal, "恢复下载失败")
		return
	}

	response.SuccessWithMsg(c, "已恢复下载", nil)
}

// DownloadCancel 取消下载
func (h *FileHandler) DownloadCancel(c *gin.Context) {
	var req DownloadTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	task, err := h.DownloadService.GetTask(req.TaskID)
	if err != nil || task.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作此下载任务")
		return
	}

	if err := h.DownloadService.CancelDownload(req.TaskID); err != nil {
		log.Printf("download cancel error: %v", err)
		response.Error(c, response.CodeInternal, "取消下载失败")
		return
	}

	response.SuccessWithMsg(c, "已取消下载", nil)
}

// DownloadList 获取用户活跃/暂停下载列表
func (h *FileHandler) DownloadList(c *gin.Context) {
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

	tasks, total, err := h.DownloadService.DownloadTaskRepo.FindByUserAndStatuses(userID, []int8{
		model.DownloadStatusDownloading,
		model.DownloadStatusPaused,
	}, offset, pageSize)
	if err != nil {
		log.Printf("download list error: %v", err)
		response.Error(c, response.CodeInternal, "获取下载列表失败")
		return
	}

	response.Success(c, DownloadListResp{
		Items:    tasks,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// TasksList 统一任务列表（上传+下载合并查询）
func (h *FileHandler) TasksList(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var (
		uploadTasks   []*model.UploadTask
		downloadTasks []*model.DownloadTask
	)

	g, _ := errgroup.WithContext(c.Request.Context())

	// 并发查询上传任务：status=1(上传中) 和 5(已暂停)
	g.Go(func() error {
		var err error
		uploadTasks, err = h.UploadService.GetUnfinishedTasks(userID)
		return err
	})

	// 并发查询下载任务：status=1(下载中) 和 3(已暂停)
	g.Go(func() error {
		var err error
		downloadTasks, _, err = h.DownloadService.DownloadTaskRepo.FindByUserAndStatuses(userID, []int8{
			model.DownloadStatusDownloading,
			model.DownloadStatusPaused,
		}, 0, 0)
		return err
	})

	if err := g.Wait(); err != nil {
		log.Printf("tasks list error: %v", err)
		response.Error(c, response.CodeInternal, "获取任务列表失败")
		return
	}

	response.Success(c, TasksListResp{
		UploadTasks:   uploadTasks,
		DownloadTasks: downloadTasks,
	})
}

// TasksHistory 分页查询历史任务（已完成/失败/取消）
func (h *FileHandler) TasksHistory(c *gin.Context) {
	userID := c.GetInt64("user_id")

	taskType := c.DefaultQuery("type", "download")
	keyword := c.Query("keyword")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	// 默认状态：已完成 + 失败 + 已取消
	var statuses []int8
	if statusStr := c.Query("status"); statusStr != "" {
		for _, s := range strings.Split(statusStr, ",") {
			v, err := strconv.ParseInt(strings.TrimSpace(s), 10, 8)
			if err == nil {
				statuses = append(statuses, int8(v))
			}
		}
	}

	switch taskType {
	case "upload":
		if len(statuses) == 0 {
			statuses = []int8{model.UploadStatusCompleted, model.UploadStatusCancelled}
		}
		// upload_task 没有 FindHistoryByUser，使用 FindByUserAndStatus 分页变体
		// 为 upload 复用 download repo 的模式，这里简化处理
		tasks, total, err := h.findUploadHistory(userID, statuses, keyword, offset, pageSize)
		if err != nil {
			log.Printf("tasks history upload error: %v", err)
			response.Error(c, response.CodeInternal, "获取上传历史失败")
			return
		}
		response.Success(c, TasksHistoryResp{
			Items:    tasks,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		})
	default:
		if len(statuses) == 0 {
			statuses = []int8{model.DownloadStatusCompleted, model.DownloadStatusFailed, model.DownloadStatusCancelled}
		}
		tasks, total, err := h.DownloadService.DownloadTaskRepo.FindHistoryByUser(userID, statuses, keyword, offset, pageSize)
		if err != nil {
			log.Printf("tasks history download error: %v", err)
			response.Error(c, response.CodeInternal, "获取下载历史失败")
			return
		}
		response.Success(c, TasksHistoryResp{
			Items:    tasks,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		})
	}
}

// findUploadHistory 分页查询上传历史（内部辅助方法）
func (h *FileHandler) findUploadHistory(userID int64, statuses []int8, keyword string, offset, limit int) ([]*model.UploadTask, int64, error) {
	// 先通过 FindByUserAndStatus 获取全部，内存中过滤 + 分页
	allTasks, err := h.UploadTaskRepo.FindByUserAndStatus(userID, statuses)
	if err != nil {
		return nil, 0, err
	}

	// keyword 过滤
	var filtered []*model.UploadTask
	if keyword != "" {
		lowerKW := strings.ToLower(keyword)
		for _, t := range allTasks {
			if strings.Contains(strings.ToLower(t.FileName), lowerKW) {
				filtered = append(filtered, t)
			}
		}
	} else {
		filtered = allTasks
	}

	total := int64(len(filtered))

	// 分页切片
	if offset >= len(filtered) {
		return []*model.UploadTask{}, total, nil
	}
	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	return filtered[offset:end], total, nil
}

// TasksStats 今日任务统计（并发查询上传+下载）
func (h *FileHandler) TasksStats(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var (
		uploadStats   *repository.TodayStats
		downloadStats *repository.TodayStats
	)

	g, _ := errgroup.WithContext(c.Request.Context())

	g.Go(func() error {
		var err error
		uploadStats, err = h.UploadTaskRepo.GetTodayStats(userID)
		return err
	})

	g.Go(func() error {
		var err error
		downloadStats, err = h.DownloadService.DownloadTaskRepo.GetTodayStats(userID)
		return err
	})

	if err := g.Wait(); err != nil {
		log.Printf("tasks stats error: %v", err)
		response.Error(c, response.CodeInternal, "获取统计失败")
		return
	}

	resp := TasksStatsResp{}
	if uploadStats != nil {
		resp.Upload = &TaskStatsItem{
			Count:     uploadStats.Count,
			TotalSize: uploadStats.TotalSize,
			AvgSpeed:  uploadStats.AvgSpeed,
		}
	}
	if downloadStats != nil {
		resp.Download = &TaskStatsItem{
			Count:     downloadStats.Count,
			TotalSize: downloadStats.TotalSize,
			AvgSpeed:  downloadStats.AvgSpeed,
		}
	}

	response.Success(c, resp)
}

// TasksBatch 批量操作任务（pause/resume/cancel）
func (h *FileHandler) TasksBatch(c *gin.Context) {
	var req TasksBatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "请求参数错误: "+err.Error())
		return
	}

	if len(req.TaskIDs) == 0 {
		response.Error(c, response.CodeBadRequest, "taskIds不能为空")
		return
	}

	if req.Action != "pause" && req.Action != "resume" && req.Action != "cancel" {
		response.Error(c, response.CodeBadRequest, "action必须为 pause/resume/cancel")
		return
	}

	userID := c.GetInt64("user_id")

	switch req.TaskType {
	case "upload":
		if err := h.UploadService.BatchAction(userID, req.TaskIDs, req.Action); err != nil {
			log.Printf("tasks batch upload error: %v", err)
			response.Error(c, response.CodeInternal, "批量操作上传任务失败")
			return
		}
	case "download":
		if err := h.DownloadService.BatchAction(userID, req.TaskIDs, req.Action); err != nil {
			log.Printf("tasks batch download error: %v", err)
			response.Error(c, response.CodeInternal, "批量操作下载任务失败")
			return
		}
	default:
		response.Error(c, response.CodeBadRequest, "taskType必须为 upload 或 download")
		return
	}

	response.SuccessWithMsg(c, "批量操作成功", nil)
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

	// 解析 visibility 过滤参数（partition: 0=私有, 1=公共）
	var visibility *int8
	if pv := c.Query("partition"); pv != "" {
		v, parseErr := strconv.ParseInt(pv, 10, 8)
		if parseErr == nil {
			val := int8(v)
			if val == 0 || val == 1 {
				visibility = &val
			}
		}
	}

	// 解析新增查询参数
	keyword := c.Query("keyword")
	var fileType *int8
	if ft := c.Query("fileType"); ft != "" {
		v, parseErr := strconv.ParseInt(ft, 10, 8)
		if parseErr == nil {
			val := int8(v)
			fileType = &val
		}
	}
	sortBy := c.DefaultQuery("sortBy", "createTime")
	sortOrder := c.DefaultQuery("sortOrder", "desc")

	files, total, err := h.StorageService.ListFiles(userID, folderID, visibility, keyword, fileType, sortBy, sortOrder, page, pageSize)
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

// PublicList 公开文件列表（无需登录即可查看）
func (h *FileHandler) PublicList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// 解析可选的 folderId 参数，0 表示不限制
	var folderID int64
	if fid := c.Query("folderId"); fid != "" {
		var parseErr error
		folderID, parseErr = strconv.ParseInt(fid, 10, 64)
		if parseErr != nil {
			folderID = 0
		}
	}

	keyword := c.Query("keyword")
	var fileType *int8
	if ft := c.Query("fileType"); ft != "" {
		v, parseErr := strconv.ParseInt(ft, 10, 8)
		if parseErr == nil {
			val := int8(v)
			fileType = &val
		}
	}
	sortBy := c.DefaultQuery("sortBy", "createTime")
	sortOrder := c.DefaultQuery("sortOrder", "desc")

	files, total, err := h.StorageService.ListPublicFiles(folderID, keyword, fileType, sortBy, sortOrder, page, pageSize)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取公开文件列表失败")
		return
	}

	list := make([]FileInfoResp, 0, len(files))

	// 收集唯一用户ID，批量获取昵称
	userIDs := make(map[int64]bool)
	for i := range files {
		userIDs[files[i].UserID] = true
	}
	ids := make([]int64, 0, len(userIDs))
	for uid := range userIDs {
		ids = append(ids, uid)
	}
	userMap, _ := h.UserRepo.FindByIDs(ids)

	for i := range files {
		resp := toFileInfoResp(&files[i])
		// 填充上传者昵称
		if u, ok := userMap[files[i].UserID]; ok {
			resp.UploaderName = u.Nickname
		}
		list = append(list, resp)
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

	h.logOperation(c, userID, OperTypeDownload, 1, &fileInfo.ID, "下载文件: "+fileInfo.FileName)

	// 使用 c.File() 替代 c.FileAttachment() 以支持 HTTP Range 请求（断点续传下载）
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileInfo.FileName))
	c.Header("Accept-Ranges", "bytes")
	c.File(fileInfo.FullPath)
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

	h.logOperation(c, userID, OperTypeDelete, 1, &fileInfo.ID, "删除文件: "+fileInfo.FileName)
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

	h.logOperation(c, userID, OperTypeMove, 1, &fileInfo.ID, fmt.Sprintf("移动文件: %s → folderID=%d", fileInfo.FileName, req.TargetFolderID))
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

	h.logOperation(c, userID, OperTypeRecover, 1, &fileInfo.ID, "恢复文件: "+fileInfo.FileName)
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

	h.logOperation(c, userID, OperTypeHardDelete, 1, &fileInfo.ID, "彻底删除文件: "+fileInfo.FileName)
	response.SuccessWithMsg(c, "文件已彻底删除", nil)
}

// UpdateVisibilityReq 更新文件可见性请求
type UpdateVisibilityReq struct {
	Visibility int8   `json:"visibility" binding:"oneof=0 1"`
	Password   string `json:"password"` // 设为公有时需提供密码确认
}

// UpdateVisibility 切换文件可见性（公共/私有）
func (h *FileHandler) UpdateVisibility(c *gin.Context) {
	userID := c.GetInt64("user_id")

	fileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	var req UpdateVisibilityReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: visibility 必须为 0 或 1")
		return
	}

	// 验证文件所有权
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
		response.Error(c, response.CodeForbidden, "无权操作该文件")
		return
	}

	if fileInfo.IsDelete == 1 {
		response.Error(c, response.CodeBadRequest, "已删除的文件无法修改可见性")
		return
	}

	// 设为公共(visibility=1)时必须提供密码确认
	if req.Visibility == 1 {
		if req.Password == "" {
			response.Error(c, response.CodeBadRequest, "设为公共需要密码确认")
			return
		}
		user, err := h.UserRepo.FindByID(userID)
		if err != nil {
			response.Error(c, response.CodeInternal, "获取用户信息失败")
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
			response.Error(c, response.CodePasswordWrong, "密码错误")
			return
		}
	}

	if err := h.FileRepo.UpdateVisibility(fileID, req.Visibility); err != nil {
		response.Error(c, response.CodeInternal, "更新可见性失败")
		return
	}

	// 同步更新关联的上传任务可见性（确保公共空间能查询到该文件）
	if fileInfo.TaskID != nil && *fileInfo.TaskID != "" {
		_ = h.UploadTaskRepo.UpdateVisibility(*fileInfo.TaskID, req.Visibility)
	}

	visibilityLabel := "设为私有"
	if req.Visibility == 1 {
		visibilityLabel = "设为公共"
	}
	h.logOperation(c, userID, OperTypeVisibility, 1, &fileInfo.ID, visibilityLabel+": "+fileInfo.FileName)

	response.SuccessWithMsg(c, "可见性更新成功", nil)
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
