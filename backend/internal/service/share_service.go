package service

import (
	"errors"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// 分享类型常量
const (
	ShareTypeFile   int8 = 1
	ShareTypeFolder int8 = 2
)

// 分享权限常量
const (
	SharePermRead     int8 = 1
	SharePermReadDown int8 = 2
)

// 过期类型常量
const (
	ExpireTypePermanent int8 = 1
	ExpireType1Day      int8 = 2
	ExpireType7Days     int8 = 3
	ExpireType30Days    int8 = 4
)

// 分享状态常量
const (
	ShareStatusActive   int8 = 1
	ShareStatusInactive int8 = 0
)

// 分享查看操作类型常量（与 handler.OperTypeShareView 对齐）
var (
	operTypeShareView = int8(11)
	resourceTypeShare = int8(3) // 资源类型：分享
)

// ShareService 分享服务
type ShareService struct {
	ShareRepo        *repository.ShareRepo
	FileRepo         *repository.FileRepo
	FolderRepo       *repository.FolderRepo
	UserRepo         *repository.UserRepo
	OperationLogRepo *repository.OperationLogRepo
}

// ShareRecordResp 分享记录响应
type ShareRecordResp struct {
	ID              int64      `json:"id"`
	ShareType       int8       `json:"shareType"`
	ResourceID      int64      `json:"resourceId"`
	ShareUserID     int64      `json:"shareUserId"`
	ShareUserName   string     `json:"shareUserName"`
	ReceiveUserID   int64      `json:"receiveUserId"`
	ReceiveUserName string     `json:"receiveUserName"`
	SharePerm       int8       `json:"sharePerm"`
	ExpireType      int8       `json:"expireType"`
	ExpireTime      *time.Time `json:"expireTime"`
	ResourceName    string     `json:"resourceName"`
	Status          int8       `json:"status"`
	CreateTime      time.Time  `json:"createTime"`
}

// ShareContentsResp 分享内容响应
type ShareContentsResp struct {
	ShareID      int64            `json:"shareId"`
	ShareType    int8             `json:"shareType"`
	ResourceID   int64            `json:"resourceId"`
	ResourceName string           `json:"resourceName"`
	SharePerm    int8             `json:"sharePerm"`
	File         *model.FileInfo  `json:"file,omitempty"`
	Folder       *model.Folder    `json:"folder,omitempty"`
	Files        []model.FileInfo `json:"files,omitempty"`
}

var (
	ErrShareNotFound      = errors.New("分享记录不存在")
	ErrShareExpired       = errors.New("分享已过期")
	ErrShareClosed        = errors.New("分享已关闭")
	ErrNoPermission       = errors.New("无权操作该分享")
	ErrResourceNotFound   = errors.New("分享的资源不存在")
	ErrShareAlreadyExists = errors.New("该资源已存在活跃分享")
	ErrCannotShareToSelf  = errors.New("不能分享给自己")
)

// CreateShare 创建分享
func (s *ShareService) CreateShare(shareUserID, receiveUserID, resourceID int64, shareType, sharePerm, expireType int8) (*ShareRecordResp, error) {
	if shareUserID == receiveUserID {
		return nil, ErrCannotShareToSelf
	}

	// 检查资源是否存在
	if shareType == ShareTypeFile {
		file, err := s.FileRepo.FindByID(resourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		if file.UserID != shareUserID {
			return nil, ErrNoPermission
		}
		if file.IsDelete == 1 {
			return nil, ErrResourceNotFound
		}
	} else if shareType == ShareTypeFolder {
		folder, err := s.FolderRepo.FindByID(resourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		if folder.UserID != shareUserID {
			return nil, ErrNoPermission
		}
	}

	// 检查是否已存在活跃分享
	existing, err := s.ShareRepo.FindByResource(resourceID, shareType)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if existing != nil {
		return nil, ErrShareAlreadyExists
	}

	// 验证接收用户是否存在
	_, err = s.UserRepo.FindByID(receiveUserID)
	if err != nil {
		return nil, ErrResourceNotFound
	}

	now := time.Now()
	share := &model.ShareRecord{
		ShareType:     shareType,
		ResourceID:    resourceID,
		ShareUserID:   shareUserID,
		ReceiveUserID: receiveUserID,
		SharePerm:     sharePerm,
		ExpireType:    expireType,
		ExpireTime:    calcExpireTime(expireType, now),
		Status:        ShareStatusActive,
		CreateTime:    now,
		UpdateTime:    now,
	}

	if err := s.ShareRepo.Create(share); err != nil {
		return nil, err
	}

	return s.toShareRecordResp(share)
}

// GetMyShares 获取我分享出的记录
func (s *ShareService) GetMyShares(shareUserID int64) ([]ShareRecordResp, error) {
	shares, err := s.ShareRepo.FindByShareUserID(shareUserID)
	if err != nil {
		return nil, err
	}

	resp := make([]ShareRecordResp, 0, len(shares))
	for i := range shares {
		r, err := s.toShareRecordResp(&shares[i])
		if err != nil {
			return nil, err
		}
		resp = append(resp, *r)
	}
	return resp, nil
}

// GetReceivedShares 获取我收到的分享
func (s *ShareService) GetReceivedShares(receiveUserID int64) ([]ShareRecordResp, error) {
	shares, err := s.ShareRepo.FindByReceiveUserID(receiveUserID)
	if err != nil {
		return nil, err
	}

	resp := make([]ShareRecordResp, 0, len(shares))
	for i := range shares {
		r, err := s.toShareRecordResp(&shares[i])
		if err != nil {
			return nil, err
		}
		resp = append(resp, *r)
	}
	return resp, nil
}

// GetShareContents 获取分享内容详情
func (s *ShareService) GetShareContents(shareID, userID int64) (*ShareContentsResp, error) {
	share, err := s.ShareRepo.FindByID(shareID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrShareNotFound
		}
		return nil, err
	}

	// 检查权限：分享者或接收者均可查看
	if share.ShareUserID != userID && share.ReceiveUserID != userID {
		return nil, ErrNoPermission
	}

	// 检查状态
	if share.Status != ShareStatusActive {
		return nil, ErrShareClosed
	}

	// 检查过期
	if share.ExpireTime != nil && share.ExpireTime.Before(time.Now()) {
		return nil, ErrShareExpired
	}

	// 记录查看日志（异步、静默失败不影响主流程）
	go s.logShareView(shareID, userID)

	var resourceName string
	var file *model.FileInfo
	var folder *model.Folder
	var files []model.FileInfo

	if share.ShareType == ShareTypeFile {
		f, err := s.FileRepo.FindByID(share.ResourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		if f.IsDelete == 1 {
			return nil, ErrResourceNotFound
		}
		resourceName = f.FileName
		file = f
	} else {
		f, err := s.FolderRepo.FindByID(share.ResourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		resourceName = f.FolderName
		folder = f
		// 列出文件夹下所有未删除文件
		files, _, err = s.FileRepo.FindByUserAndFolder(f.UserID, f.ID, nil, "", nil, "", "", 0, 0)
		if err != nil {
			return nil, err
		}
	}

	return &ShareContentsResp{
		ShareID:      share.ID,
		ShareType:    share.ShareType,
		ResourceID:   share.ResourceID,
		ResourceName: resourceName,
		SharePerm:    share.SharePerm,
		File:         file,
		Folder:       folder,
		Files:        files,
	}, nil
}

// UpdateShare 更新分享权限和过期时间
func (s *ShareService) UpdateShare(shareID, userID int64, sharePerm, expireType int8) error {
	share, err := s.ShareRepo.FindByID(shareID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrShareNotFound
		}
		return err
	}

	if share.ShareUserID != userID {
		return ErrNoPermission
	}

	if share.Status != ShareStatusActive {
		return ErrShareClosed
	}

	share.SharePerm = sharePerm
	share.ExpireType = expireType
	share.ExpireTime = calcExpireTime(expireType, share.CreateTime)
	share.UpdateTime = time.Now()

	return s.ShareRepo.Update(share)
}

// CloseShare 关闭（取消）分享
func (s *ShareService) CloseShare(shareID, userID int64) error {
	share, err := s.ShareRepo.FindByID(shareID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrShareNotFound
		}
		return err
	}

	if share.ShareUserID != userID {
		return ErrNoPermission
	}

	if share.Status != ShareStatusActive {
		return ErrShareClosed
	}

	return s.ShareRepo.Deactivate(shareID)
}

// toShareRecordResp 将 ShareRecord 转为响应结构
func (s *ShareService) toShareRecordResp(share *model.ShareRecord) (*ShareRecordResp, error) {
	resp := &ShareRecordResp{
		ID:            share.ID,
		ShareType:     share.ShareType,
		ResourceID:    share.ResourceID,
		ShareUserID:   share.ShareUserID,
		ReceiveUserID: share.ReceiveUserID,
		SharePerm:     share.SharePerm,
		ExpireType:    share.ExpireType,
		ExpireTime:    share.ExpireTime,
		Status:        share.Status,
		CreateTime:    share.CreateTime,
	}

	// 获取分享者用户名
	shareUser, err := s.UserRepo.FindByID(share.ShareUserID)
	if err == nil {
		resp.ShareUserName = shareUser.Nickname
	}

	// 获取接收者用户名
	receiveUser, err := s.UserRepo.FindByID(share.ReceiveUserID)
	if err == nil {
		resp.ReceiveUserName = receiveUser.Nickname
	}

	// 获取资源名称
	if share.ShareType == ShareTypeFile {
		file, err := s.FileRepo.FindByID(share.ResourceID)
		if err == nil {
			resp.ResourceName = file.FileName
		}
	} else if share.ShareType == ShareTypeFolder {
		folder, err := s.FolderRepo.FindByID(share.ResourceID)
		if err == nil {
			resp.ResourceName = folder.FolderName
		}
	}

	return resp, nil
}

// BatchShareItem 批量分享项
type BatchShareItem struct {
	ReceiveUserID int64 `json:"receiveUserId"`
	ResourceID    int64 `json:"resourceId"`
	ShareType     int8  `json:"shareType"`
	SharePerm     int8  `json:"sharePerm"`
	ExpireType    int8  `json:"expireType"`
}

// CreateBatchShare 批量创建分享（不检查重复分享）
func (s *ShareService) CreateBatchShare(shareUserID int64, items []BatchShareItem) ([]ShareRecordResp, error) {
	results := make([]ShareRecordResp, 0, len(items))

	for _, item := range items {
		resp, err := s.createShareInternal(shareUserID, item.ReceiveUserID, item.ResourceID, item.ShareType, item.SharePerm, item.ExpireType)
		if err != nil {
			continue // 跳过失败的项，收集成功的
		}
		results = append(results, *resp)
	}

	return results, nil
}

// createShareInternal 创建分享内部方法（不检查重复分享）
func (s *ShareService) createShareInternal(shareUserID, receiveUserID, resourceID int64, shareType, sharePerm, expireType int8) (*ShareRecordResp, error) {
	if shareUserID == receiveUserID {
		return nil, ErrCannotShareToSelf
	}

	// 检查资源是否存在
	if shareType == ShareTypeFile {
		file, err := s.FileRepo.FindByID(resourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		if file.UserID != shareUserID {
			return nil, ErrNoPermission
		}
		if file.IsDelete == 1 {
			return nil, ErrResourceNotFound
		}
	} else if shareType == ShareTypeFolder {
		folder, err := s.FolderRepo.FindByID(resourceID)
		if err != nil {
			return nil, ErrResourceNotFound
		}
		if folder.UserID != shareUserID {
			return nil, ErrNoPermission
		}
	}

	// 验证接收用户是否存在
	_, err := s.UserRepo.FindByID(receiveUserID)
	if err != nil {
		return nil, ErrResourceNotFound
	}

	now := time.Now()
	share := &model.ShareRecord{
		ShareType:     shareType,
		ResourceID:    resourceID,
		ShareUserID:   shareUserID,
		ReceiveUserID: receiveUserID,
		SharePerm:     sharePerm,
		ExpireType:    expireType,
		ExpireTime:    calcExpireTime(expireType, now),
		Status:        ShareStatusActive,
		CreateTime:    now,
		UpdateTime:    now,
	}

	if err := s.ShareRepo.Create(share); err != nil {
		return nil, err
	}

	return s.toShareRecordResp(share)
}

// logShareView 异步记录分享查看操作
func (s *ShareService) logShareView(shareID, userID int64) {
	if s.OperationLogRepo == nil {
		return
	}
	now := time.Now()
	logEntry := &model.SysOperationLog{
		UserID:       &userID,
		OperType:     operTypeShareView,
		ResourceType: &resourceTypeShare,
		ResourceID:   &shareID,
		OperDesc:     "查看分享内容",
		CreateTime:   now,
	}
	_ = s.OperationLogRepo.Create(logEntry)
}

// ShareViewer 分享查看者信息
type ShareViewer struct {
	UserID   int64     `json:"userId"`
	UserName string    `json:"userName"`
	ViewTime time.Time `json:"viewTime"`
}

// GetShareViewers 获取分享的查看者列表（去重，按最近查看时间排序）
func (s *ShareService) GetShareViewers(shareID, userID int64) ([]ShareViewer, error) {
	// 验证分享存在且用户有权限
	share, err := s.ShareRepo.FindByID(shareID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrShareNotFound
		}
		return nil, err
	}
	if share.ShareUserID != userID {
		return nil, ErrNoPermission
	}

	// 查询去重的查看者
	var viewers []ShareViewer
	err = s.ShareRepo.DB.Table("sys_operation_log").
		Select("sys_operation_log.user_id, sys_user.nickname AS user_name, MAX(sys_operation_log.create_time) AS view_time").
		Joins("LEFT JOIN sys_user ON sys_user.id = sys_operation_log.user_id").
		Where("sys_operation_log.resource_type = ? AND sys_operation_log.resource_id = ? AND sys_operation_log.oper_type = ?", resourceTypeShare, shareID, operTypeShareView).
		Group("sys_operation_log.user_id, sys_user.nickname").
		Order("view_time DESC").
		Find(&viewers).Error

	return viewers, err
}

// calcExpireTime 根据过期类型计算过期时间
func calcExpireTime(expireType int8, baseTime time.Time) *time.Time {
	switch expireType {
	case ExpireType1Day:
		t := baseTime.AddDate(0, 0, 1)
		return &t
	case ExpireType7Days:
		t := baseTime.AddDate(0, 0, 7)
		return &t
	case ExpireType30Days:
		t := baseTime.AddDate(0, 0, 30)
		return &t
	default:
		return nil // 永久有效
	}
}
