package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// FriendRepo 好友仓库
type FriendRepo struct{ DB *gorm.DB }

// ======================== 好友关系 ========================

// CreateFriendRelation 创建好友关系（插入一条记录）
func (r *FriendRepo) CreateFriendRelation(userID, friendID int64) error {
	rel := &model.FriendRelation{
		UserID:   userID,
		FriendID: friendID,
	}
	return r.DB.Create(rel).Error
}

// DeleteFriendRelation 删除双向好友关系
func (r *FriendRepo) DeleteFriendRelation(userID, friendID int64) error {
	return r.DB.Where(
		"(user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
		userID, friendID, friendID, userID,
	).Delete(&model.FriendRelation{}).Error
}

// FindFriendsByUserID 查询某用户的所有好友关系
func (r *FriendRepo) FindFriendsByUserID(userID int64) ([]model.FriendRelation, error) {
	var relations []model.FriendRelation
	err := r.DB.Where("user_id = ?", userID).Find(&relations).Error
	return relations, err
}

// IsFriend 检查是否存在好友关系
func (r *FriendRepo) IsFriend(userID, friendID int64) (bool, error) {
	var count int64
	err := r.DB.Model(&model.FriendRelation{}).
		Where("user_id = ? AND friend_id = ?", userID, friendID).
		Count(&count).Error
	return count > 0, err
}

// ======================== 好友申请 ========================

// CreateRequest 创建好友申请
func (r *FriendRepo) CreateRequest(req *model.FriendRequest) error {
	return r.DB.Create(req).Error
}

// FindRequestByID 按ID查询申请
func (r *FriendRepo) FindRequestByID(id int64) (*model.FriendRequest, error) {
	var req model.FriendRequest
	err := r.DB.First(&req, id).Error
	if err != nil {
		return nil, err
	}
	return &req, nil
}

// FindPendingRequest 查询两个用户之间待处理的申请
func (r *FriendRepo) FindPendingRequest(fromUserID, toUserID int64) (*model.FriendRequest, error) {
	var req model.FriendRequest
	err := r.DB.Where("from_user_id = ? AND to_user_id = ? AND status = ?",
		fromUserID, toUserID, model.FriendRequestPending).
		First(&req).Error
	if err != nil {
		return nil, err
	}
	return &req, nil
}

// FindRequestsByToUser 查询收到的申请列表，status为nil时查全部
func (r *FriendRepo) FindRequestsByToUser(toUserID int64, status *int8) ([]model.FriendRequest, error) {
	var reqs []model.FriendRequest
	q := r.DB.Where("to_user_id = ?", toUserID)
	if status != nil {
		q = q.Where("status = ?", *status)
	}
	err := q.Order("create_time DESC").Find(&reqs).Error
	return reqs, err
}

// FindRequestsByFromUser 查询发出的申请列表，status为nil时查全部
func (r *FriendRepo) FindRequestsByFromUser(fromUserID int64, status *int8) ([]model.FriendRequest, error) {
	var reqs []model.FriendRequest
	q := r.DB.Where("from_user_id = ?", fromUserID)
	if status != nil {
		q = q.Where("status = ?", *status)
	}
	err := q.Order("create_time DESC").Find(&reqs).Error
	return reqs, err
}

// UpdateRequestStatus 更新申请状态
func (r *FriendRepo) UpdateRequestStatus(id int64, status int8) error {
	return r.DB.Model(&model.FriendRequest{}).Where("id = ?", id).Update("status", status).Error
}
