package service

import (
	"errors"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"
	jwtPkg "local-file-hub/backend/pkg/jwt"

	"golang.org/x/crypto/bcrypt"
)

// AuthService 认证服务
type AuthService struct {
	UserRepo   *repository.UserRepo
	DeviceRepo *repository.DeviceRepo
	JWTSecret  string
	JWTExpire  time.Duration
}

// LoginResp 登录响应
type LoginResp struct {
	Token    string   `json:"token"`
	User     UserInfo `json:"user"`
	DeviceID int64    `json:"deviceId"`
}

// UserInfo 用户信息
type UserInfo struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Nickname     string    `json:"nickname"`
	Role         int8      `json:"role"`
	Status       int8      `json:"status"`
	CreateTime   time.Time `json:"createTime"`
	StorageQuota int64     `json:"storageQuota"`
	UsedSize     int64     `json:"usedSize"`
	StorageRoot  string    `json:"storageRoot"`
}

var (
	ErrInvalidCredentials = errors.New("用户名或密码错误")
	ErrUserDisabled       = errors.New("账号已被禁用")
)

// Login 用户登录
func (s *AuthService) Login(username, password string, deviceType int8, deviceName, localIP string) (*LoginResp, error) {
	user, err := s.UserRepo.FindByUsername(username)
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	if user.Status != 1 {
		return nil, ErrUserDisabled
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password))
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := jwtPkg.GenerateToken(user.ID, user.Role, s.JWTSecret, s.JWTExpire)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	device := &model.SysDevice{
		UserID:        user.ID,
		DeviceType:    deviceType,
		DeviceName:    deviceName,
		LocalIP:       localIP,
		Token:         token,
		Online:        1,
		LastLoginTime: &now,
	}
	if err := s.DeviceRepo.Create(device); err != nil {
		return nil, err
	}

	return &LoginResp{
		Token:    token,
		DeviceID: device.ID,
		User: UserInfo{
			ID:           user.ID,
			Username:     user.Username,
			Nickname:     user.Nickname,
			Role:         user.Role,
			Status:       user.Status,
			CreateTime:   user.CreateTime,
			StorageQuota: user.StorageQuota,
			UsedSize:     user.UsedSize,
			StorageRoot:  user.StorageRoot,
		},
	}, nil
}

// Logout 用户退出登录
func (s *AuthService) Logout(token string) error {
	device, err := s.DeviceRepo.FindByToken(token)
	if err != nil {
		return err
	}
	return s.DeviceRepo.DeleteByID(device.ID)
}

// GetCurrentUser 获取当前用户信息
func (s *AuthService) GetCurrentUser(userID int64) (*model.SysUser, error) {
	return s.UserRepo.FindByID(userID)
}
