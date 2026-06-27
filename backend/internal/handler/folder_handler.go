package handler

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
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

// FolderHandler 文件夹处理器
type FolderHandler struct {
	FolderRepo     *repository.FolderRepo
	UserRepo       *repository.UserRepo
	StorageService *service.StorageService
}

// CreateFolderReq 创建文件夹请求
type CreateFolderReq struct {
	ParentID   int64  `json:"parentId"`
	FolderName string `json:"folderName" binding:"required"`
	IsPublic   *int8  `json:"isPublic"`
}

// CreateFolderResp 创建文件夹响应
type CreateFolderResp struct {
	ID         int64  `json:"id"`
	FolderName string `json:"folderName"`
	ParentID   int64  `json:"parentId"`
	FullPath   string `json:"fullPath"`
}

// CreateFolder 创建文件夹
func (h *FolderHandler) CreateFolder(c *gin.Context) {
	var req CreateFolderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	// 如果指定了父目录，验证存在性
	var parentPath string
	if req.ParentID > 0 {
		parent, err := h.FolderRepo.FindByID(req.ParentID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				response.Error(c, response.CodeNotFound, "父目录不存在")
				return
			}
			response.Error(c, response.CodeInternal, "查询父目录失败")
			return
		}
		if parent.UserID != userID {
			response.Error(c, response.CodeForbidden, "无权操作该目录")
			return
		}
		parentPath = parent.FullPath
	}

	// 检查同名文件夹
	existing, err := h.FolderRepo.FindByNameUnderParent(userID, req.ParentID, req.FolderName)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		response.Error(c, response.CodeInternal, "查询文件夹失败")
		return
	}
	if existing != nil {
		response.Error(c, response.CodeBadRequest, "同名文件夹已存在")
		return
	}

	// 构建完整路径
	fullPath := filepath.Join(parentPath, req.FolderName)
	if req.ParentID == 0 {
		user, err := h.StorageService.GetUserQuota(userID)
		if err != nil {
			response.Error(c, response.CodeInternal, "获取用户信息失败")
			return
		}
		fullPath = filepath.Join(user.StorageRoot, req.FolderName)
	}

	now := time.Now()
	folder := &model.Folder{
		UserID:     userID,
		ParentID:   req.ParentID,
		FolderName: req.FolderName,
		FullPath:   fullPath,
		IsPublic:   req.IsPublic,
		CreateTime: now,
		UpdateTime: now,
	}

	if err := h.FolderRepo.Create(folder); err != nil {
		response.Error(c, response.CodeInternal, "创建文件夹失败")
		return
	}

	response.Success(c, CreateFolderResp{
		ID:         folder.ID,
		FolderName: folder.FolderName,
		ParentID:   folder.ParentID,
		FullPath:   folder.FullPath,
	})
}

// ListFolders 获取文件夹列表
func (h *FolderHandler) ListFolders(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var parentID int64
	if pid := c.Query("parentId"); pid != "" {
		var err error
		parentID, err = strconv.ParseInt(pid, 10, 64)
		if err != nil {
			response.Error(c, response.CodeBadRequest, "parentId 参数格式错误")
			return
		}
	}

	folders, err := h.FolderRepo.FindByUserAndParent(userID, parentID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取文件夹列表失败")
		return
	}

	response.Success(c, folders)
}

// GetFolder 获取文件夹详情
func (h *FolderHandler) GetFolder(c *gin.Context) {
	userID := c.GetInt64("user_id")

	folderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	folder, err := h.FolderRepo.FindByID(folderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件夹不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件夹失败")
		return
	}

	if folder.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权查看该文件夹")
		return
	}

	response.Success(c, folder)
}

// UpdateFolderReq 更新文件夹请求
type UpdateFolderReq struct {
	FolderName string `json:"folderName" binding:"required"`
}

// UpdateFolder 重命名文件夹
func (h *FolderHandler) UpdateFolder(c *gin.Context) {
	var req UpdateFolderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	folderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	folder, err := h.FolderRepo.FindByID(folderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件夹不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件夹失败")
		return
	}

	if folder.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权修改该文件夹")
		return
	}

	// 检查同名
	existing, err := h.FolderRepo.FindByNameUnderParent(userID, folder.ParentID, req.FolderName)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		response.Error(c, response.CodeInternal, "校验文件夹名称失败")
		return
	}
	if existing != nil && existing.ID != folderID {
		response.Error(c, response.CodeBadRequest, "同名文件夹已存在")
		return
	}

	// 更新路径
	parentDir := filepath.Dir(folder.FullPath)
	folder.FolderName = req.FolderName
	folder.FullPath = filepath.Join(parentDir, req.FolderName)
	folder.UpdateTime = time.Now()

	if err := h.FolderRepo.Update(folder); err != nil {
		response.Error(c, response.CodeInternal, "更新文件夹失败")
		return
	}

	response.Success(c, folder)
}

// DeleteFolder 删除文件夹
func (h *FolderHandler) DeleteFolder(c *gin.Context) {
	userID := c.GetInt64("user_id")

	folderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	folder, err := h.FolderRepo.FindByID(folderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件夹不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件夹失败")
		return
	}

	if folder.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权删除该文件夹")
		return
	}

	if err := h.FolderRepo.DeleteByUserAndID(userID, folderID); err != nil {
		response.Error(c, response.CodeInternal, "删除文件夹失败")
		return
	}

	response.SuccessWithMsg(c, "文件夹已删除", nil)
}

// MoveFolderReq 移动文件夹请求
type MoveFolderReq struct {
	FolderID       int64 `json:"folderId" binding:"required"`
	TargetParentID int64 `json:"targetParentId" binding:"required"`
}

// MoveFolder 移动文件夹
func (h *FolderHandler) MoveFolder(c *gin.Context) {
	var req MoveFolderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	userID := c.GetInt64("user_id")

	// 验证源文件夹
	folder, err := h.FolderRepo.FindByID(req.FolderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, response.CodeNotFound, "文件夹不存在")
			return
		}
		response.Error(c, response.CodeInternal, "查询文件夹失败")
		return
	}
	if folder.UserID != userID {
		response.Error(c, response.CodeForbidden, "无权操作该文件夹")
		return
	}

	// 不允许移动到自身或子目录下
	if req.FolderID == req.TargetParentID {
		response.Error(c, response.CodeBadRequest, "不能将文件夹移动到自己下面")
		return
	}

	// 验证目标父目录
	var targetParentPath string
	if req.TargetParentID > 0 {
		targetParent, err := h.FolderRepo.FindByID(req.TargetParentID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				response.Error(c, response.CodeNotFound, "目标父目录不存在")
				return
			}
			response.Error(c, response.CodeInternal, "查询目标父目录失败")
			return
		}
		if targetParent.UserID != userID {
			response.Error(c, response.CodeForbidden, "无权操作目标目录")
			return
		}
		targetParentPath = targetParent.FullPath
	} else {
		user, err := h.StorageService.GetUserQuota(userID)
		if err != nil {
			response.Error(c, response.CodeInternal, "获取用户信息失败")
			return
		}
		targetParentPath = user.StorageRoot
	}

	// 检查目标目录下是否有同名文件夹
	existing, err := h.FolderRepo.FindByNameUnderParent(userID, req.TargetParentID, folder.FolderName)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		response.Error(c, response.CodeInternal, "校验文件夹名称失败")
		return
	}
	if existing != nil && existing.ID != folder.ID {
		response.Error(c, response.CodeBadRequest, "目标目录下已存在同名文件夹")
		return
	}

	// 更新文件夹
	folder.ParentID = req.TargetParentID
	folder.FullPath = targetParentPath + "/" + folder.FolderName
	folder.UpdateTime = time.Now()

	if err := h.FolderRepo.Update(folder); err != nil {
		response.Error(c, response.CodeInternal, "移动文件夹失败")
		return
	}

	response.SuccessWithMsg(c, "文件夹已移动", folder)
}

// FolderTreeNode 文件夹树节点
type FolderTreeNode struct {
	ID         int64             `json:"id"`
	ParentID   int64             `json:"parentId"`
	FolderName string            `json:"folderName"`
	Children   []*FolderTreeNode `json:"children"`
}

// GetTree 获取文件夹树
func (h *FolderHandler) GetTree(c *gin.Context) {
	userID := c.GetInt64("user_id")

	// 支持按可见性过滤（0=私有, 1=公共，不传则返回全部）
	var isPublic *int8
	if ip := c.Query("isPublic"); ip != "" {
		v, parseErr := strconv.ParseInt(ip, 10, 8)
		if parseErr == nil {
			val := int8(v)
			isPublic = &val
		}
	}

	folders, err := h.FolderRepo.FindByUserAndPublic(userID, isPublic)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取文件夹列表失败")
		return
	}

	// 构建节点映射
	nodeMap := make(map[int64]*FolderTreeNode)
	for i := range folders {
		nodeMap[folders[i].ID] = &FolderTreeNode{
			ID:         folders[i].ID,
			ParentID:   folders[i].ParentID,
			FolderName: folders[i].FolderName,
			Children:   []*FolderTreeNode{},
		}
	}

	// 构建树结构（迭代有序切片保证顺序确定性，非 map）
	var roots []*FolderTreeNode
	for i := range folders {
		node := nodeMap[folders[i].ID]
		if node.ParentID == 0 {
			roots = append(roots, node)
		} else {
			parent, ok := nodeMap[node.ParentID]
			if ok {
				parent.Children = append(parent.Children, node)
			} else {
				roots = append(roots, node)
			}
		}
	}

	response.Success(c, roots)
}

// ==================== 批量创建文件夹 ====================

// BatchCreateFolderReq 批量创建文件夹请求
type BatchCreateFolderReq struct {
	ParentID int64             `json:"parentId"`
	IsPublic *int8             `json:"isPublic"`
	Folders  []BatchFolderItem `json:"folders"`
}

// BatchFolderItem 批量文件夹项
type BatchFolderItem struct {
	TempKey    string `json:"tempKey" binding:"required"`
	FolderName string `json:"folderName" binding:"required"`
}

// BatchFolderResult 批量文件夹结果
type BatchFolderResult struct {
	TempKey    string `json:"tempKey"`
	ID         int64  `json:"id"`
	FolderName string `json:"folderName"`
	Status     string `json:"status"`
}

// BatchCreateFolderResp 批量创建文件夹响应
type BatchCreateFolderResp struct {
	Folders []BatchFolderResult `json:"folders"`
}

// BatchCreateFolders 批量创建文件夹
// 对文件夹按 tempKey 拓扑排序后逐层创建，同名冲突时复用已有文件夹
func (h *FolderHandler) BatchCreateFolders(c *gin.Context) {
	var req BatchCreateFolderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	if len(req.Folders) == 0 {
		response.Error(c, response.CodeBadRequest, "folders 不能为空")
		return
	}

	userID := c.GetInt64("user_id")

	// 拓扑排序：按 tempKey 中 "/" 的数量升序，确保父路径先于子路径创建
	sorted := make([]BatchFolderItem, len(req.Folders))
	copy(sorted, req.Folders)
	sort.Slice(sorted, func(i, j int) bool {
		return strings.Count(sorted[i].TempKey, "/") < strings.Count(sorted[j].TempKey, "/")
	})

	// 在事务中执行批量创建，确保全部成功或全部回滚
	var results []BatchFolderResult
	err := h.FolderRepo.DB.Transaction(func(tx *gorm.DB) error {
		txRepo := h.FolderRepo.WithTx(tx)
		created := make(map[string]int64)
		results = make([]BatchFolderResult, 0, len(sorted))

		for _, item := range sorted {
			var parentID int64

			if idx := strings.LastIndex(item.TempKey, "/"); idx >= 0 {
				// 子文件夹：从映射中查找父文件夹 ID
				parentKey := item.TempKey[:idx]
				pid, ok := created[parentKey]
				if !ok {
					return fmt.Errorf("父文件夹未找到: %s", parentKey)
				}
				parentID = pid
			} else {
				// 顶层文件夹：使用请求中的 parentID
				parentID = req.ParentID
			}

			// 同名冲突检测
			existing, ferr := txRepo.FindByNameUnderParent(userID, parentID, item.FolderName)
			if ferr != nil && !errors.Is(ferr, gorm.ErrRecordNotFound) {
				return ferr
			}

			if existing != nil {
				// 同名文件夹已存在，复用
				created[item.TempKey] = existing.ID
				results = append(results, BatchFolderResult{
					TempKey:    item.TempKey,
					ID:         existing.ID,
					FolderName: item.FolderName,
					Status:     "reused",
				})
				continue
			}

			// 构建完整路径
			var parentPath string
			if parentID > 0 {
				parent, ferr := txRepo.FindByID(parentID)
				if ferr != nil {
					return ferr
				}
				parentPath = parent.FullPath
			} else {
				user, ferr := h.StorageService.GetUserQuota(userID)
				if ferr != nil {
					return ferr
				}
				parentPath = user.StorageRoot
			}

			fullPath := filepath.Join(parentPath, item.FolderName)

			now := time.Now()
			folder := &model.Folder{
				UserID:     userID,
				ParentID:   parentID,
				FolderName: item.FolderName,
				FullPath:   fullPath,
				IsPublic:   req.IsPublic,
				CreateTime: now,
				UpdateTime: now,
			}

			if ferr := txRepo.Create(folder); ferr != nil {
				return ferr
			}

			created[item.TempKey] = folder.ID
			results = append(results, BatchFolderResult{
				TempKey:    item.TempKey,
				ID:         folder.ID,
				FolderName: item.FolderName,
				Status:     "created",
			})
		}
		return nil
	})

	if err != nil {
		response.Error(c, response.CodeInternal, "批量创建文件夹失败: "+err.Error())
		return
	}

	response.Success(c, BatchCreateFolderResp{Folders: results})
}

// ==================== 公开文件夹树 ====================

// PublicFolderNode 公开文件夹树节点（含上传者昵称）
type PublicFolderNode struct {
	ID           int64               `json:"id"`
	ParentID     int64               `json:"parentId"`
	FolderName   string              `json:"folderName"`
	UserID       int64               `json:"userId"`
	UploaderName string              `json:"uploaderName"`
	Children     []*PublicFolderNode `json:"children"`
}

// PublicTree 获取公开文件夹树（免登录）
func (h *FolderHandler) PublicTree(c *gin.Context) {
	// 解析可选的 parentId 查询参数，0 表示根目录
	var parentID int64
	if pid := c.Query("parentId"); pid != "" {
		var parseErr error
		parentID, parseErr = strconv.ParseInt(pid, 10, 64)
		if parseErr != nil {
			parentID = 0
		}
	}

	folders, err := h.FolderRepo.FindPublicFolders(parentID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取公开文件夹失败")
		return
	}

	// 收集唯一用户ID并批量获取用户昵称
	userIDs := make(map[int64]bool)
	for i := range folders {
		userIDs[folders[i].UserID] = true
	}

	ids := make([]int64, 0, len(userIDs))
	for uid := range userIDs {
		ids = append(ids, uid)
	}

	userMap, _ := h.UserRepo.FindByIDs(ids)
	userNameMap := make(map[int64]string, len(userMap))
	for uid, u := range userMap {
		userNameMap[uid] = u.Nickname
	}

	// 构建节点映射
	nodeMap := make(map[int64]*PublicFolderNode, len(folders))
	for i := range folders {
		nodeMap[folders[i].ID] = &PublicFolderNode{
			ID:           folders[i].ID,
			ParentID:     folders[i].ParentID,
			FolderName:   folders[i].FolderName,
			UserID:       folders[i].UserID,
			UploaderName: userNameMap[folders[i].UserID],
			Children:     []*PublicFolderNode{},
		}
	}

	// 构建树结构
	var roots []*PublicFolderNode
	for i := range folders {
		node := nodeMap[folders[i].ID]
		if node.ParentID == 0 {
			roots = append(roots, node)
		} else {
			parent, ok := nodeMap[node.ParentID]
			if ok {
				parent.Children = append(parent.Children, node)
			} else {
				roots = append(roots, node)
			}
		}
	}

	response.Success(c, roots)
}
