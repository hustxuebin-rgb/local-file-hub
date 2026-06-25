package handler

import (
	"errors"
	"path/filepath"
	"strconv"
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
	StorageService *service.StorageService
}

// CreateFolderReq 创建文件夹请求
type CreateFolderReq struct {
	ParentID   int64  `json:"parentId"`
	FolderName string `json:"folderName" binding:"required"`
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

	folders, err := h.FolderRepo.FindByUser(userID)
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

	// 构建树结构
	var roots []*FolderTreeNode
	for _, node := range nodeMap {
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
