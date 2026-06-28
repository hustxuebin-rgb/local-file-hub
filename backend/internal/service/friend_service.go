package service

import (
	"errors"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"gorm.io/gorm"
)

// ======================== 响应辅助结构体 ========================

// SearchUserResult 搜索用户结果
type SearchUserResult struct {
	ID                int64  `json:"id"`
	Username          string `json:"username"`
	Nickname          string `json:"nickname"`
	AvatarURL         string `json:"avatarUrl"`
	IsFriend          bool   `json:"isFriend"`
	HasPendingRequest bool   `json:"hasPendingRequest"`
}

// FriendRequestWithUser 带用户信息的好友申请
type FriendRequestWithUser struct {
	ID             int64     `json:"id"`
	FromUserID     int64     `json:"fromUserId"`
	FromUserName   string    `json:"fromUserName"`
	FromUserAvatar string    `json:"fromUserAvatar"`
	ToUserID       int64     `json:"toUserId"`
	ToUserName     string    `json:"toUserName"`
	ToUserAvatar   string    `json:"toUserAvatar"`
	Message        string    `json:"message"`
	Status         int8      `json:"status"`
	CreateTime     time.Time `json:"createTime"`
	UpdateTime     time.Time `json:"updateTime"`
}

// FriendWithUser 带用户信息的好友
type FriendWithUser struct {
	FriendID   int64     `json:"friendId"`
	Username   string    `json:"username"`
	Nickname   string    `json:"nickname"`
	AvatarURL  string    `json:"avatarUrl"`
	CreateTime time.Time `json:"createTime"`
}

// ======================== 自定义错误 ========================

var (
	ErrCannotAddSelf         = errors.New("不能添加自己为好友")
	ErrAlreadyFriend         = errors.New("对方已是好友")
	ErrRequestAlreadyExists  = errors.New("已有待处理的好友申请")
	ErrRequestNotFound       = errors.New("好友申请不存在")
	ErrRequestAlreadyHandled = errors.New("好友申请已处理")
	ErrNoPermissionToHandle  = errors.New("无权处理该申请")
)

// ======================== FriendService ========================

// FriendService 好友服务
type FriendService struct {
	FriendRepo *repository.FriendRepo
	UserRepo   *repository.UserRepo
}

// SearchUsers 搜索非好友用户
func (s *FriendService) SearchUsers(keyword string, currentUserID int64) ([]SearchUserResult, error) {
	if keyword == "" {
		return []SearchUserResult{}, nil
	}

	// 查询匹配的用户
	users, err := s.UserRepo.SearchByKeyword(keyword, currentUserID, 20)
	if err != nil {
		return nil, err
	}

	results := make([]SearchUserResult, 0, len(users))
	for _, u := range users {
		isFriend, err := s.FriendRepo.IsFriend(currentUserID, u.ID)
		if err != nil {
			return nil, err
		}

		// 检查是否有待处理申请（我发出的或我收到的）
		hasPending := false
		_, err1 := s.FriendRepo.FindPendingRequest(currentUserID, u.ID)
		if err1 != nil && !errors.Is(err1, gorm.ErrRecordNotFound) {
			return nil, err1
		}
		_, err2 := s.FriendRepo.FindPendingRequest(u.ID, currentUserID)
		if err2 != nil && !errors.Is(err2, gorm.ErrRecordNotFound) {
			return nil, err2
		}
		hasPending = (err1 == nil || err2 == nil)

		avatarURL := ""
		if u.AvatarURL != nil {
			avatarURL = *u.AvatarURL
		}

		results = append(results, SearchUserResult{
			ID:                u.ID,
			Username:          u.Username,
			Nickname:          u.Nickname,
			AvatarURL:         avatarURL,
			IsFriend:          isFriend,
			HasPendingRequest: hasPending,
		})
	}

	return results, nil
}

// SendRequest 发送好友申请
func (s *FriendService) SendRequest(fromUserID, toUserID int64, message string) (*model.FriendRequest, error) {
	// 校验不能给自己发
	if fromUserID == toUserID {
		return nil, ErrCannotAddSelf
	}

	// 校验目标用户是否存在
	_, err := s.UserRepo.FindByID(toUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("目标用户不存在")
		}
		return nil, err
	}

	// 校验对方是否已是好友
	isFriend, err := s.FriendRepo.IsFriend(fromUserID, toUserID)
	if err != nil {
		return nil, err
	}
	if isFriend {
		return nil, ErrAlreadyFriend
	}

	// 校验是否已有待处理申请
	_, err = s.FriendRepo.FindPendingRequest(fromUserID, toUserID)
	if err == nil {
		return nil, ErrRequestAlreadyExists
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if len(message) > 200 {
		message = message[:200]
	}

	req := &model.FriendRequest{
		FromUserID: fromUserID,
		ToUserID:   toUserID,
		Status:     model.FriendRequestPending,
		Message:    message,
	}

	if err := s.FriendRepo.CreateRequest(req); err != nil {
		return nil, err
	}

	return req, nil
}

// AcceptRequest 同意好友申请（事务：写双向关系 + 更新申请状态）
func (s *FriendService) AcceptRequest(requestID, toUserID int64) error {
	req, err := s.FriendRepo.FindRequestByID(requestID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrRequestNotFound
		}
		return err
	}

	// 校验权限：toUserID 必须是接收方
	if req.ToUserID != toUserID {
		return ErrNoPermissionToHandle
	}

	// 校验状态
	if req.Status != model.FriendRequestPending {
		return ErrRequestAlreadyHandled
	}

	// 事务：创建双向好友关系 + 更新申请状态
	return s.FriendRepo.DB.Transaction(func(tx *gorm.DB) error {
		friendRepo := &repository.FriendRepo{DB: tx}

		// 创建双向关系
		if err := friendRepo.CreateFriendRelation(req.FromUserID, req.ToUserID); err != nil {
			return err
		}
		if err := friendRepo.CreateFriendRelation(req.ToUserID, req.FromUserID); err != nil {
			return err
		}

		// 更新申请状态为已同意
		return friendRepo.UpdateRequestStatus(requestID, model.FriendRequestAccepted)
	})
}

// RejectRequest 拒绝好友申请
func (s *FriendService) RejectRequest(requestID, toUserID int64) error {
	req, err := s.FriendRepo.FindRequestByID(requestID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrRequestNotFound
		}
		return err
	}

	// 校验权限
	if req.ToUserID != toUserID {
		return ErrNoPermissionToHandle
	}

	// 校验状态
	if req.Status != model.FriendRequestPending {
		return ErrRequestAlreadyHandled
	}

	return s.FriendRepo.UpdateRequestStatus(requestID, model.FriendRequestRejected)
}

// GetReceivedRequests 获取收到的申请列表
func (s *FriendService) GetReceivedRequests(toUserID int64, status *int8) ([]FriendRequestWithUser, error) {
	reqs, err := s.FriendRepo.FindRequestsByToUser(toUserID, status)
	if err != nil {
		return nil, err
	}

	result, err := s.enrichRequestsWithUser(reqs)
	if err != nil {
		return nil, err
	}
	return result, nil
}

// GetSentRequests 获取发出的申请列表
func (s *FriendService) GetSentRequests(fromUserID int64, status *int8) ([]FriendRequestWithUser, error) {
	reqs, err := s.FriendRepo.FindRequestsByFromUser(fromUserID, status)
	if err != nil {
		return nil, err
	}

	result, err := s.enrichRequestsWithUser(reqs)
	if err != nil {
		return nil, err
	}
	return result, nil
}

// enrichRequestsWithUser 填充申请中的用户信息（双向填充）
func (s *FriendService) enrichRequestsWithUser(reqs []model.FriendRequest) ([]FriendRequestWithUser, error) {
	// 收集所有需要查询的用户ID
	userIDs := make(map[int64]struct{})
	for _, req := range reqs {
		userIDs[req.FromUserID] = struct{}{}
		userIDs[req.ToUserID] = struct{}{}
	}

	ids := make([]int64, 0, len(userIDs))
	for id := range userIDs {
		ids = append(ids, id)
	}

	userMap, err := s.UserRepo.FindByIDs(ids)
	if err != nil {
		return nil, err
	}

	getUserName := func(uid int64) string {
		if u, ok := userMap[uid]; ok {
			return u.Username
		}
		return ""
	}
	getUserAvatar := func(uid int64) string {
		if u, ok := userMap[uid]; ok && u.AvatarURL != nil {
			return *u.AvatarURL
		}
		return ""
	}

	result := make([]FriendRequestWithUser, 0, len(reqs))
	for _, req := range reqs {
		r := FriendRequestWithUser{
			ID:             req.ID,
			FromUserID:     req.FromUserID,
			FromUserName:   getUserName(req.FromUserID),
			FromUserAvatar: getUserAvatar(req.FromUserID),
			ToUserID:       req.ToUserID,
			ToUserName:     getUserName(req.ToUserID),
			ToUserAvatar:   getUserAvatar(req.ToUserID),
			Message:        req.Message,
			Status:         req.Status,
			CreateTime:     req.CreateTime,
			UpdateTime:     req.UpdateTime,
		}
		result = append(result, r)
	}

	return result, nil
}

// GetFriendList 获取好友列表
func (s *FriendService) GetFriendList(userID int64) ([]FriendWithUser, error) {
	relations, err := s.FriendRepo.FindFriendsByUserID(userID)
	if err != nil {
		return nil, err
	}

	if len(relations) == 0 {
		return []FriendWithUser{}, nil
	}

	// 收集好友ID
	friendIDs := make([]int64, 0, len(relations))
	for _, rel := range relations {
		friendIDs = append(friendIDs, rel.FriendID)
	}

	userMap, err := s.UserRepo.FindByIDs(friendIDs)
	if err != nil {
		return nil, err
	}

	result := make([]FriendWithUser, 0, len(relations))
	for _, rel := range relations {
		u, ok := userMap[rel.FriendID]
		if !ok {
			continue
		}
		avatarURL := ""
		if u.AvatarURL != nil {
			avatarURL = *u.AvatarURL
		}
		result = append(result, FriendWithUser{
			FriendID:   rel.FriendID,
			Username:   u.Username,
			Nickname:   u.Nickname,
			AvatarURL:  avatarURL,
			CreateTime: rel.CreateTime,
		})
	}

	return result, nil
}

// DeleteFriend 删除双向好友关系
func (s *FriendService) DeleteFriend(userID, friendID int64) error {
	isFriend, err := s.FriendRepo.IsFriend(userID, friendID)
	if err != nil {
		return err
	}
	if !isFriend {
		return errors.New("对方不是你的好友")
	}

	return s.FriendRepo.DeleteFriendRelation(userID, friendID)
}

// CheckFriend 检查好友关系
func (s *FriendService) CheckFriend(userID, friendID int64) (bool, error) {
	return s.FriendRepo.IsFriend(userID, friendID)
}
