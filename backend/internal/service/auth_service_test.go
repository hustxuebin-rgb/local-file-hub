package service

import (
	"testing"
	"time"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.SysUser{}, &model.SysDevice{})
	require.NoError(t, err)
	return db
}

func newAuthService(db *gorm.DB) *AuthService {
	return &AuthService{
		UserRepo:   &repository.UserRepo{DB: db},
		DeviceRepo: &repository.DeviceRepo{DB: db},
		JWTSecret:  "test-jwt-secret-key",
		JWTExpire:  24 * time.Hour,
	}
}

func createTestUser(t *testing.T, db *gorm.DB, username, password string, status int8, storageQuota, usedSize int64, storageRoot string) *model.SysUser {
	t.Helper()
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	require.NoError(t, err)
	user := &model.SysUser{
		Username:     username,
		Password:     string(hashed),
		Nickname:     "TestUser",
		Role:         2,
		StorageQuota: storageQuota,
		UsedSize:     usedSize,
		StorageRoot:  storageRoot,
		Status:       status,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

// ======================== Login ========================

func TestLogin_UserInfoContainsAllFields(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	createTestUser(t, db, "alice", "password123", 1, 107374182400, 53687091200, "/data/alice_root")

	resp, err := svc.Login("alice", "password123", 1, "TestDevice", "192.168.1.1")
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify UserInfo contains all expected fields
	assert.Equal(t, "alice", resp.User.Username)
	assert.Equal(t, "TestUser", resp.User.Nickname)
	assert.Equal(t, int8(2), resp.User.Role)
	assert.Equal(t, int64(107374182400), resp.User.StorageQuota)
	assert.Equal(t, int64(53687091200), resp.User.UsedSize)
	assert.Equal(t, "/data/alice_root", resp.User.StorageRoot)
	assert.NotEmpty(t, resp.Token)
	assert.Greater(t, resp.DeviceID, int64(0))
}

func TestLogin_InvalidPassword(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	createTestUser(t, db, "bob", "correct", 1, 107374182400, 0, "/data/bob_root")

	resp, err := svc.Login("bob", "wrongpassword", 1, "Device", "10.0.0.1")
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestLogin_DisabledUser(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	user := createTestUser(t, db, "charlie", "password", 1, 107374182400, 0, "/data/charlie_root")
	// GORM default tag overrides zero values; force update status to disabled
	db.Model(user).Update("status", int8(0))

	resp, err := svc.Login("charlie", "password", 1, "Device", "10.0.0.1")
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrUserDisabled)
}

func TestLogin_UserNotFound(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	resp, err := svc.Login("nonexistent", "password", 1, "Device", "10.0.0.1")
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestLogin_DeviceCreated(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	createTestUser(t, db, "dave", "pass", 1, 107374182400, 0, "/data/dave_root")

	resp, err := svc.Login("dave", "pass", 2, "MyPhone", "172.16.0.1")
	require.NoError(t, err)

	// Verify device was created
	var device model.SysDevice
	require.NoError(t, db.First(&device, resp.DeviceID).Error)
	assert.Equal(t, int8(2), device.DeviceType)
	assert.Equal(t, "MyPhone", device.DeviceName)
	assert.Equal(t, "172.16.0.1", device.LocalIP)
	assert.Equal(t, int8(1), device.Online)
	assert.Equal(t, resp.Token, device.Token)
}

func TestLogin_UserInfoZeroValues(t *testing.T) {
	db := setupAuthTestDB(t)
	svc := newAuthService(db)

	user := createTestUser(t, db, "eve", "pass", 1, 107374182400, 0, "/data/eve_root")
	// GORM default tag overrides zero values; force update to zero
	db.Model(user).Updates(map[string]interface{}{
		"storage_quota": int64(0),
		"used_size":     int64(0),
	})

	resp, err := svc.Login("eve", "pass", 1, "Device", "10.0.0.1")
	require.NoError(t, err)

	// Verify zero values are returned correctly
	assert.Equal(t, int64(0), resp.User.StorageQuota)
	assert.Equal(t, int64(0), resp.User.UsedSize)
	assert.Equal(t, "/data/eve_root", resp.User.StorageRoot)
}
