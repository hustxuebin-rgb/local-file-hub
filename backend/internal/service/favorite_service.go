package service

import (
	"errors"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// FavoriteResp 收藏列表响应结构
type FavoriteResp struct {
	ID          int64     `json:"id"`
	TargetType  int8      `json:"targetType"`
	TargetID    int64     `json:"targetId"`
	TargetName  string    `json:"targetName"`
	TargetSize  int64     `json:"targetSize"`
	TargetType2 int8      `json:"targetType2"`
	OwnerName   string    `json:"ownerName"`
	CreateTime  time.Time `json:"createTime"`
}

var (
	ErrFavoriteAlreadyExists = errors.New("收藏已存在")
	ErrFavoriteNotFound      = errors.New("收藏不存在")
)

// FavoriteService 收藏服务
type FavoriteService struct {
	FavoriteRepo *repository.FavoriteRepo
	FileRepo     *repository.FileRepo
	FolderRepo   *repository.FolderRepo
	ShareRepo    *repository.ShareRepo
	UserRepo     *repository.UserRepo
}

// AddFavorite 添加收藏
func (s *FavoriteService) AddFavorite(userID int64, targetType int8, targetID int64) error {
	// 校验目标存在性
	if err := s.validateTarget(userID, targetType, targetID); err != nil {
		return err
	}

	// 检查是否已收藏
	exists, err := s.FavoriteRepo.Exists(userID, targetType, targetID)
	if err != nil {
		return err
	}
	if exists {
		return ErrFavoriteAlreadyExists
	}

	fav := &model.Favorite{
		UserID:     userID,
		TargetType: targetType,
		TargetID:   targetID,
	}
	return s.FavoriteRepo.Create(fav)
}

// RemoveFavorite 取消收藏
func (s *FavoriteService) RemoveFavorite(userID int64, targetType int8, targetID int64) error {
	exists, err := s.FavoriteRepo.Exists(userID, targetType, targetID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrFavoriteNotFound
	}
	return s.FavoriteRepo.Delete(userID, targetType, targetID)
}

// GetFavorites 获取收藏列表（分页，支持关键词搜索、目标类型过滤和排序）
// keyword: 搜索关键词，模糊匹配目标名称；为空时不应用过滤
// targetType: nil 表示不过滤，否则按指定类型筛选
// sortBy: 排序字段标识，由 handler 层白名单校验后传入
// sortOrder: 排序方向，仅 asc 或 desc
func (s *FavoriteService) GetFavorites(userID int64, page, pageSize int, keyword string, targetType *int8, sortBy, sortOrder string) ([]FavoriteResp, int64, error) {
	offset := (page - 1) * pageSize

	favorites, total, err := s.FavoriteRepo.FindByUserIDWithFilter(userID, offset, pageSize, keyword, targetType, sortBy, sortOrder)
	if err != nil {
		return nil, 0, err
	}

	resp := make([]FavoriteResp, 0, len(favorites))
	for _, fav := range favorites {
		r := FavoriteResp{
			ID:         fav.ID,
			TargetType: fav.TargetType,
			TargetID:   fav.TargetID,
			CreateTime: fav.CreateTime,
		}
		s.fillTargetInfo(&r, fav.TargetType, fav.TargetID)
		resp = append(resp, r)
	}

	return resp, total, nil
}

// validateTarget 校验收藏目标是否存在
func (s *FavoriteService) validateTarget(userID int64, targetType int8, targetID int64) error {
	switch targetType {
	case model.FavoriteTargetFile:
		file, err := s.FileRepo.FindByID(targetID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("文件不存在")
			}
			return err
		}
		if file.IsDelete == 1 {
			return errors.New("文件已被删除")
		}
	case model.FavoriteTargetFolder:
		_, err := s.FolderRepo.FindByID(targetID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("文件夹不存在")
			}
			return err
		}
	case model.FavoriteTargetShare:
		_, err := s.ShareRepo.FindByID(targetID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("分享记录不存在")
			}
			return err
		}
	default:
		return errors.New("无效的收藏目标类型")
	}
	return nil
}

// fillTargetInfo 填充收藏目标的关联信息
func (s *FavoriteService) fillTargetInfo(resp *FavoriteResp, targetType int8, targetID int64) {
	switch targetType {
	case model.FavoriteTargetFile:
		file, err := s.FileRepo.FindByID(targetID)
		if err == nil {
			resp.TargetName = file.FileName
			resp.TargetSize = file.FileSize
			resp.TargetType2 = file.FileType
			owner, oerr := s.UserRepo.FindByID(file.UserID)
			if oerr == nil {
				resp.OwnerName = owner.Nickname
			}
		}
	case model.FavoriteTargetFolder:
		folder, err := s.FolderRepo.FindByID(targetID)
		if err == nil {
			resp.TargetName = folder.FolderName
			resp.TargetSize = 0
			owner, oerr := s.UserRepo.FindByID(folder.UserID)
			if oerr == nil {
				resp.OwnerName = owner.Nickname
			}
		}
	case model.FavoriteTargetShare:
		share, err := s.ShareRepo.FindByID(targetID)
		if err == nil {
			resp.TargetName = s.getShareResourceName(share)
			owner, oerr := s.UserRepo.FindByID(share.ShareUserID)
			if oerr == nil {
				resp.OwnerName = owner.Nickname
			}
		}
	}
}

// getShareResourceName 获取分享关联的资源名称
func (s *FavoriteService) getShareResourceName(share *model.ShareRecord) string {
	if share.ShareType == 1 {
		file, err := s.FileRepo.FindByID(share.ResourceID)
		if err == nil {
			return file.FileName
		}
	} else if share.ShareType == 2 {
		folder, err := s.FolderRepo.FindByID(share.ResourceID)
		if err == nil {
			return folder.FolderName
		}
	}
	return ""
}
