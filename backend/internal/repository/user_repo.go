package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// UserRepo 用户仓库
type UserRepo struct{ DB *gorm.DB }

// FindByUsername 根据用户名查找用户
func (r *UserRepo) FindByUsername(username string) (*model.SysUser, error) {
	var user model.SysUser
	err := r.DB.Where("username = ?", username).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByID 根据ID查找用户
func (r *UserRepo) FindByID(id int64) (*model.SysUser, error) {
	var user model.SysUser
	err := r.DB.First(&user, id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Create 创建用户
func (r *UserRepo) Create(user *model.SysUser) error {
	return r.DB.Create(user).Error
}

// UpdateUsedSize 更新用户已用空间
func (r *UserRepo) UpdateUsedSize(userID int64, delta int64) error {
	return r.DB.Model(&model.SysUser{}).Where("id = ?", userID).
		Update("used_size", gorm.Expr("used_size + ?", delta)).Error
}
