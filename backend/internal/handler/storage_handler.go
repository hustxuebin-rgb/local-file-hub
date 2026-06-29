package handler

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// StorageHandler 存储管理处理器
type StorageHandler struct {
	StorageService   *service.StorageService
	DB               *gorm.DB
	OperationLogRepo *repository.OperationLogRepo
}

// DiskInfoHandler 获取磁盘信息（实时刷新文件系统状态）
func (h *StorageHandler) DiskInfoHandler(c *gin.Context) {
	var disks []model.StorageDisk
	if err := h.DB.Find(&disks).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘信息失败")
		return
	}

	// 遍历刷新每个磁盘的实际文件系统状态
	for i := range disks {
		var stat syscall.Statfs_t
		if err := syscall.Statfs(disks[i].DiskPath, &stat); err != nil {
			// 路径不可访问，标记为离线
			disks[i].Status = 0
			if err := h.DB.Model(&disks[i]).Update("status", int8(0)).Error; err != nil {
				log.Printf("更新磁盘 %s 离线状态失败: %v", disks[i].DiskPath, err)
			}
			continue
		}
		totalSize := int64(stat.Blocks) * int64(stat.Bsize)
		availableSize := int64(stat.Bavail) * int64(stat.Bsize)
		usedSize := totalSize - availableSize

		// 更新磁盘信息
		if err := h.DB.Model(&disks[i]).Updates(map[string]interface{}{
			"total_size":     totalSize,
			"used_size":      usedSize,
			"available_size": availableSize,
			"status":         int8(1),
		}).Error; err != nil {
			log.Printf("更新磁盘 %s 信息失败: %v", disks[i].DiskPath, err)
		}
		disks[i].TotalSize = totalSize
		disks[i].UsedSize = usedSize
		disks[i].AvailableSize = availableSize
		disks[i].Status = 1
	}

	response.Success(c, disks)
}

// SyncTaskHandler 获取同步任务
func (h *StorageHandler) SyncTaskHandler(c *gin.Context) {
	var task model.StorageSyncTask
	if err := h.DB.First(&task).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取同步任务失败")
		return
	}
	response.Success(c, task)
}

// UpdateSyncTaskReq 更新同步任务请求体
type UpdateSyncTaskReq struct {
	SyncMode     int8   `json:"syncMode"`
	CronExpr     string `json:"cronExpr"`
	IgnoreSuffix string `json:"ignoreSuffix"`
	SpeedLimit   int64  `json:"speedLimit"`
}

// UpdateSyncTaskHandler 更新同步任务
func (h *StorageHandler) UpdateSyncTaskHandler(c *gin.Context) {
	var req UpdateSyncTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}
	var task model.StorageSyncTask
	if err := h.DB.First(&task).Error; err != nil {
		h.DB.Create(&model.StorageSyncTask{
			SyncMode:     req.SyncMode,
			CronExpr:     req.CronExpr,
			IgnoreSuffix: req.IgnoreSuffix,
			SpeedLimit:   &req.SpeedLimit,
		})
		response.SuccessWithMsg(c, "同步任务已创建", nil)
		return
	}
	task.SyncMode = req.SyncMode
	task.CronExpr = req.CronExpr
	task.IgnoreSuffix = req.IgnoreSuffix
	task.SpeedLimit = &req.SpeedLimit
	h.DB.Save(&task)
	response.SuccessWithMsg(c, "同步任务已更新", nil)
}

// ManualSyncHandler 手动触发同步
func (h *StorageHandler) ManualSyncHandler(c *gin.Context) {
	response.SuccessWithMsg(c, "手动同步已触发，请查看日志", nil)
}

// SyncLogsHandler 获取同步日志（管理员视角，不限用户）
func (h *StorageHandler) SyncLogsHandler(c *gin.Context) {
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "20")

	limit := 20
	if s, e := strconv.Atoi(pageSize); e == nil && s > 0 && s <= 100 {
		limit = s
	}

	offset := 0
	if p, e := strconv.Atoi(page); e == nil && p > 0 {
		offset = (p - 1) * limit
	}

	var logs []OperationLogResp
	var total int64

	baseQuery := h.DB.Table("sys_operation_log").
		Select("sys_operation_log.*, sys_user.nickname AS user_name").
		Joins("LEFT JOIN sys_user ON sys_user.id = sys_operation_log.user_id")

	baseQuery.Count(&total)
	baseQuery.Order("sys_operation_log.create_time DESC").Offset(offset).Limit(limit).Find(&logs)

	response.Success(c, map[string]interface{}{"total": total, "list": logs})
}

// QuotaHandler 获取用户配额
func (h *StorageHandler) QuotaHandler(c *gin.Context) {
	userID := c.GetInt64("user_id")
	quota, err := h.StorageService.GetUserQuota(userID)
	if err != nil {
		response.Error(c, response.CodeInternal, "获取配额失败")
		return
	}
	response.Success(c, quota)
}

// CreateDiskReq 创建磁盘请求体
type CreateDiskReq struct {
	DiskPath string `json:"diskPath" binding:"required"`
	DiskType *int8  `json:"diskType" binding:"required"`
	Remark   string `json:"remark"`
}

// UpdateDiskReq 更新磁盘请求体
type UpdateDiskReq struct {
	DiskPath *string `json:"diskPath"`
	DiskType *int8   `json:"diskType"`
	Status   *int8   `json:"status"`
	Remark   *string `json:"remark"`
}

// CreateDiskHandler 创建磁盘
func (h *StorageHandler) CreateDiskHandler(c *gin.Context) {
	var req CreateDiskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	// 校验 diskPath 是否存在
	if info, err := os.Stat(req.DiskPath); err != nil || !info.IsDir() {
		response.Error(c, response.CodeBadRequest, "磁盘路径不存在或不是目录")
		return
	}

	// 获取磁盘容量信息
	var stat syscall.Statfs_t
	if err := syscall.Statfs(req.DiskPath, &stat); err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘信息失败")
		return
	}
	totalSize := int64(stat.Blocks) * int64(stat.Bsize)
	availableSize := int64(stat.Bavail) * int64(stat.Bsize)
	usedSize := totalSize - availableSize

	disk := &model.StorageDisk{
		DiskType:      *req.DiskType,
		DiskPath:      req.DiskPath,
		TotalSize:     totalSize,
		UsedSize:      usedSize,
		AvailableSize: availableSize,
		Status:        1, // 默认正常
		Remark:        req.Remark,
	}

	if err := h.DB.Create(disk).Error; err != nil {
		response.Error(c, response.CodeInternal, "创建磁盘记录失败")
		return
	}

	response.SuccessWithMsg(c, "磁盘已添加", disk)
}

// UpdateDiskHandler 更新磁盘
func (h *StorageHandler) UpdateDiskHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	var req UpdateDiskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误: "+err.Error())
		return
	}

	var disk model.StorageDisk
	if err := h.DB.First(&disk, id).Error; err != nil {
		response.Error(c, response.CodeNotFound, "磁盘不存在")
		return
	}

	updates := map[string]interface{}{}
	if req.DiskPath != nil {
		updates["disk_path"] = *req.DiskPath
	}
	if req.DiskType != nil {
		updates["disk_type"] = *req.DiskType
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&disk).Updates(updates).Error; err != nil {
			response.Error(c, response.CodeInternal, "更新磁盘失败")
			return
		}
	}

	response.SuccessWithMsg(c, "磁盘已更新", nil)
}

// DeleteDiskHandler 删除磁盘
func (h *StorageHandler) DeleteDiskHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, response.CodeBadRequest, "参数格式错误")
		return
	}

	var disk model.StorageDisk
	if err := h.DB.First(&disk, id).Error; err != nil {
		response.Error(c, response.CodeNotFound, "磁盘不存在")
		return
	}

	if err := h.DB.Delete(&disk).Error; err != nil {
		response.Error(c, response.CodeInternal, "删除磁盘失败")
		return
	}

	response.SuccessWithMsg(c, "磁盘已删除", nil)
}

// ScanMountsHandler 扫描系统挂载点
func (h *StorageHandler) ScanMountsHandler(c *gin.Context) {
	cmd := exec.Command("mount")
	output, err := cmd.Output()
	if err != nil {
		// Linux 回退：读取 /proc/mounts
		data, readErr := os.ReadFile("/proc/mounts")
		if readErr != nil {
			response.Error(c, response.CodeInternal, "执行 mount 命令失败: "+err.Error())
			return
		}
		output = data
	}

	// 跨平台正则：兼容 macOS 和 Linux mount 输出格式
	// macOS: device on /path (fstype, options)
	// Linux: device on /path type fstype (options)
	var re *regexp.Regexp
	if runtime.GOOS == "darwin" {
		re = regexp.MustCompile(`(\S+)\s+on\s+(\S+)\s+\((\w+)`)
	} else {
		re = regexp.MustCompile(`(\S+)\s+on\s+(\S+)\s+type\s+(\w+)`)
	}

	lines := strings.Split(string(output), "\n")

	var mounts []model.MountInfo
	for _, line := range lines {
		matches := re.FindStringSubmatch(line)
		if matches == nil {
			continue
		}
		device := matches[1]
		mountPoint := matches[2]
		fsType := matches[3]

		// 过滤虚拟挂载点
		if strings.HasPrefix(mountPoint, "/dev") ||
			strings.HasPrefix(mountPoint, "/proc") ||
			strings.HasPrefix(mountPoint, "/sys") ||
			strings.HasPrefix(mountPoint, "/run") ||
			strings.HasPrefix(mountPoint, "/snap") ||
			strings.Contains(device, "devfs") ||
			strings.Contains(device, "map ") ||
			fsType == "tmpfs" ||
			fsType == "cgroup" ||
			fsType == "overlay" {
			continue
		}

		// 过滤系统保护盘
		if isSystemProtectedMount(mountPoint, device, fsType) {
			continue
		}

		mounts = append(mounts, model.MountInfo{
			Device:     device,
			MountPoint: mountPoint,
			FsType:     fsType,
		})
	}

	response.Success(c, mounts)
}

// BrowseDirsHandler 浏览目录（只返回子目录）
func (h *StorageHandler) BrowseDirsHandler(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		response.Error(c, response.CodeBadRequest, "路径不能为空")
		return
	}
	if strings.Contains(path, "..") {
		response.Error(c, response.CodeBadRequest, "路径包含非法字符")
		return
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		response.Error(c, response.CodeInternal, "读取目录失败: "+err.Error())
		return
	}

	var dirs []model.DirEntry
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		dirs = append(dirs, model.DirEntry{
			Name: name,
			Path: filepath.Join(path, name),
		})
	}

	response.Success(c, dirs)
}

// CreateDirReq 创建目录请求体
type CreateDirReq struct {
	ParentPath string `json:"parentPath"`
	DirName    string `json:"dirName"`
}

// CreateDirHandler 创建目录
func (h *StorageHandler) CreateDirHandler(c *gin.Context) {
	var req CreateDirReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}

	if strings.Contains(req.ParentPath, "..") {
		response.Error(c, response.CodeBadRequest, "路径包含非法字符")
		return
	}

	if req.DirName == "" {
		response.Error(c, response.CodeBadRequest, "目录名不能为空")
		return
	}
	if req.DirName == ".." ||
		strings.Contains(req.DirName, "../") ||
		strings.Contains(req.DirName, "/") ||
		strings.Contains(req.DirName, "\"") {
		response.Error(c, response.CodeBadRequest, "目录名包含非法字符")
		return
	}

	targetPath := filepath.Join(req.ParentPath, req.DirName)
	if err := os.MkdirAll(targetPath, 0755); err != nil {
		response.Error(c, response.CodeInternal, "创建目录失败: "+err.Error())
		return
	}

	response.SuccessWithMsg(c, "目录创建成功", nil)
}

// DeleteDirReq 删除目录请求体
type DeleteDirReq struct {
	Path string `json:"path"`
}

// DeleteDirHandler 删除空目录
func (h *StorageHandler) DeleteDirHandler(c *gin.Context) {
	var req DeleteDirReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, response.CodeBadRequest, "参数错误")
		return
	}

	if req.Path == "" {
		response.Error(c, response.CodeBadRequest, "路径不能为空")
		return
	}
	if strings.Contains(req.Path, "..") {
		response.Error(c, response.CodeBadRequest, "路径包含非法字符")
		return
	}

	// 检查目录是否为空
	entries, err := os.ReadDir(req.Path)
	if err != nil {
		response.Error(c, response.CodeInternal, "读取目录失败: "+err.Error())
		return
	}
	if len(entries) > 0 {
		response.Error(c, response.CodeBadRequest, "目录非空，无法删除")
		return
	}

	if err := os.Remove(req.Path); err != nil {
		response.Error(c, response.CodeInternal, "删除目录失败: "+err.Error())
		return
	}

	response.SuccessWithMsg(c, "目录已删除", nil)
}

// DiskListSimpleHandler 获取启用的磁盘简要列表
func (h *StorageHandler) DiskListSimpleHandler(c *gin.Context) {
	var disks []model.StorageDisk
	if err := h.DB.Select("id, disk_path, disk_type").Where("status = ?", 1).Find(&disks).Error; err != nil {
		response.Error(c, response.CodeInternal, "获取磁盘列表失败")
		return
	}

	var result []model.DiskSimple
	for _, d := range disks {
		result = append(result, model.DiskSimple{
			ID:       d.ID,
			DiskPath: d.DiskPath,
			DiskType: d.DiskType,
		})
	}

	response.Success(c, result)
}

// isSystemProtectedMount 判断挂载点是否为系统保护盘
func isSystemProtectedMount(mountPoint, device, fsType string) bool {
	switch runtime.GOOS {
	case "darwin":
		return isDarwinSystemMount(mountPoint, device)
	default:
		return isLinuxSystemMount(mountPoint, device, fsType)
	}
}

// isDarwinSystemMount macOS 系统保护盘判断
func isDarwinSystemMount(mountPoint, device string) bool {
	// 系统根
	if mountPoint == "/" {
		return true
	}
	// /System/Volumes/* （Data, Preboot, VM, Recovery, Update, Hardware, xarts）
	if strings.HasPrefix(mountPoint, "/System/Volumes/") {
		return true
	}
	// 虚拟内存交换分区
	if mountPoint == "/private/var/vm" {
		return true
	}
	// com.apple 系列（如 com.apple.os.update-*）
	if strings.Contains(device, "com.apple") {
		return true
	}
	return false
}

// isLinuxSystemMount Linux 系统保护盘判断
func isLinuxSystemMount(mountPoint, device, fsType string) bool {
	// 系统根
	if mountPoint == "/" {
		return true
	}
	// boot 分区
	if mountPoint == "/boot" || mountPoint == "/boot/efi" {
		return true
	}
	// snap 包（squashfs）
	if fsType == "squashfs" {
		return true
	}
	// loop 设备
	if strings.HasPrefix(device, "/dev/loop") {
		return true
	}
	return false
}
