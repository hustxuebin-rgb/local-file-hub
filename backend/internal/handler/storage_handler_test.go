package handler

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupStorageTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.StorageDisk{})
	require.NoError(t, err)
	return db
}

func newStorageHandler(db *gorm.DB) *StorageHandler {
	return &StorageHandler{
		StorageService: &service.StorageService{
			DB:         db,
			UserRepo:   &repository.UserRepo{DB: db},
			FolderRepo: &repository.FolderRepo{DB: db},
			FileRepo:   &repository.FileRepo{DB: db},
		},
		DB: db,
	}
}

// ======================== DiskInfoHandler ========================

func TestDiskInfoHandler_EmptyDatabase(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/disks", nil)

	handler.DiskInfoHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var disks []model.StorageDisk
	require.NoError(t, json.Unmarshal(dataJSON, &disks))
	assert.Len(t, disks, 0)
}

func TestDiskInfoHandler_InvalidPathMarksOffline(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	// Create a disk with a non-existent path → Statfs will fail → status 0
	disk := &model.StorageDisk{
		DiskType:      1,
		DiskPath:      "/nonexistent/path/that/does/not/exist",
		TotalSize:     1000000,
		UsedSize:      500000,
		AvailableSize: 500000,
		Status:        1,
	}
	require.NoError(t, db.Create(disk).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/disks", nil)

	handler.DiskInfoHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Disk should be marked offline (status=0) due to Statfs failure
	var updatedDisk model.StorageDisk
	require.NoError(t, db.First(&updatedDisk, disk.ID).Error)
	assert.Equal(t, int8(0), updatedDisk.Status, "不可访问的磁盘路径应标记为离线")
}

func TestDiskInfoHandler_ValidPathRefreshes(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	tmpDir := t.TempDir()

	disk := &model.StorageDisk{
		DiskType:      1,
		DiskPath:      tmpDir,
		TotalSize:     0,
		UsedSize:      0,
		AvailableSize: 0,
		Status:        1,
	}
	require.NoError(t, db.Create(disk).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/disks", nil)

	handler.DiskInfoHandler(c)

	assert.Equal(t, 200, w.Code)

	// Disk should be online (status=1) and have refreshed sizes
	var updatedDisk model.StorageDisk
	require.NoError(t, db.First(&updatedDisk, disk.ID).Error)
	assert.Equal(t, int8(1), updatedDisk.Status, "有效路径应标记为在线")
	assert.Greater(t, updatedDisk.TotalSize, int64(0), "有效路径应刷新总容量")
	assert.Greater(t, updatedDisk.AvailableSize, int64(0), "有效路径应刷新可用容量")
}

// ======================== QuotaHandler ========================

func TestQuotaHandler_Success(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.SysUser{}))

	user := &model.SysUser{
		Username:     "testuser",
		Password:     "hashed",
		Nickname:     "Test",
		Role:         2,
		StorageRoot:  "/data/test",
		StorageQuota: 107374182400,
		UsedSize:     53687091200,
		Status:       1,
	}
	require.NoError(t, db.Create(user).Error)

	handler := &StorageHandler{
		StorageService: &service.StorageService{
			DB:         db,
			UserRepo:   &repository.UserRepo{DB: db},
			FolderRepo: &repository.FolderRepo{DB: db},
			FileRepo:   &repository.FileRepo{DB: db},
		},
		DB: db,
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/quota", nil)
	c.Set("user_id", user.ID)

	handler.QuotaHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
}

// ======================== CreateDiskHandler ========================

func TestCreateDiskHandler_ValidPath(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	tmpDir := t.TempDir()
	body := `{"diskPath":"` + filepath.ToSlash(tmpDir) + `","diskType":1,"remark":"测试磁盘"}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/storage/disks", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.CreateDiskHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	var disks []model.StorageDisk
	db.Find(&disks)
	assert.Len(t, disks, 1)
	assert.Equal(t, int8(1), disks[0].Status)
}

func TestCreateDiskHandler_InvalidPath(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	body := `{"diskPath":"/nonexistent/path","diskType":1,"remark":"测试"}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/storage/disks", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.CreateDiskHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestCreateDiskHandler_PathNotDirectory(t *testing.T) {
	db := setupStorageTestDB(t)
	handler := newStorageHandler(db)

	tmpFile, err := os.CreateTemp("", "testfile")
	require.NoError(t, err)
	tmpFile.Close()

	body := `{"diskPath":"` + filepath.ToSlash(tmpFile.Name()) + `","diskType":1}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/storage/disks", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.CreateDiskHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}
