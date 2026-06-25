package repository

import (
	"local-file-hub/backend/internal/model"

	"gorm.io/gorm"
)

// DeviceRepo 设备仓库
type DeviceRepo struct{ DB *gorm.DB }

// Create 创建设备
func (r *DeviceRepo) Create(device *model.SysDevice) error {
	return r.DB.Create(device).Error
}

// FindByToken 根据 token 查找设备
func (r *DeviceRepo) FindByToken(token string) (*model.SysDevice, error) {
	var device model.SysDevice
	err := r.DB.Where("token = ?", token).First(&device).Error
	if err != nil {
		return nil, err
	}
	return &device, nil
}

// UpdateOnline 更新设备在线状态
func (r *DeviceRepo) UpdateOnline(deviceID int64, online int8) error {
	return r.DB.Model(&model.SysDevice{}).Where("id = ?", deviceID).
		Update("online", online).Error
}

// DeleteByID 根据ID删除设备
func (r *DeviceRepo) DeleteByID(id int64) error {
	return r.DB.Delete(&model.SysDevice{}, id).Error
}

// FindByID 根据ID查找设备
func (r *DeviceRepo) FindByID(id int64) (*model.SysDevice, error) {
	var device model.SysDevice
	err := r.DB.Where("id = ?", id).First(&device).Error
	if err != nil {
		return nil, err
	}
	return &device, nil
}

// FindByUserAndType 根据用户ID和设备类型查找最近在线的设备
func (r *DeviceRepo) FindByUserAndType(userID int64, deviceType int8) (*model.SysDevice, error) {
	var device model.SysDevice
	err := r.DB.Where("user_id = ? AND device_type = ? AND online = 1", userID, deviceType).
		Order("last_login_time DESC").
		First(&device).Error
	if err != nil {
		return nil, err
	}
	return &device, nil
}

// FindServerDevice 查找Server设备（device_type=3 且在线）
func (r *DeviceRepo) FindServerDevice() (*model.SysDevice, error) {
	var device model.SysDevice
	err := r.DB.Where("device_type = 3 AND online = 1").
		First(&device).Error
	if err != nil {
		return nil, err
	}
	return &device, nil
}

// FindOnlineDevices 查找所有在线设备
func (r *DeviceRepo) FindOnlineDevices() ([]model.SysDevice, error) {
	var devices []model.SysDevice
	err := r.DB.Where("online = ?", 1).Find(&devices).Error
	return devices, err
}
