package handler

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

// ======================== SyncLogsHandler ========================

func setupSyncLogsTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.SysOperationLog{}, &model.SysUser{})
	require.NoError(t, err)
	return db
}

func newSyncLogsHandler(db *gorm.DB) *StorageHandler {
	return &StorageHandler{
		StorageService: &service.StorageService{
			DB:         db,
			UserRepo:   &repository.UserRepo{DB: db},
			FolderRepo: &repository.FolderRepo{DB: db},
			FileRepo:   &repository.FileRepo{DB: db},
		},
		DB:               db,
		OperationLogRepo: &repository.OperationLogRepo{DB: db},
	}
}

// syncLogsResp matches the SyncLogsHandler response structure
type syncLogsResp struct {
	Total int64              `json:"total"`
	List  []OperationLogResp `json:"list"`
}

func TestSyncLogsHandler_EmptyDatabase(t *testing.T) {
	db := setupSyncLogsTestDB(t)
	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(0), result.Total)
	assert.Len(t, result.List, 0)
}

func TestSyncLogsHandler_DefaultPagination(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	// Create a test user
	user := &model.SysUser{ID: 100, Username: "admin", Nickname: "管理员", Password: "xxx", StorageRoot: "/root", Role: 1}
	require.NoError(t, db.Create(user).Error)

	// Create 25 logs (more than default pageSize=20)
	now := time.Now()
	for i := 0; i < 25; i++ {
		userID := int64(100)
		log := &model.SysOperationLog{
			UserID:     &userID,
			OperType:   1,
			OperDesc:   "test log " + fmt.Sprintf("%d", i),
			CreateTime: now.Add(-time.Duration(i) * time.Minute),
		}
		require.NoError(t, db.Create(log).Error)
	}

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(25), result.Total, "total应等于全部日志数量")
	assert.Len(t, result.List, 20, "默认pageSize=20，应返回20条")

	// 验证按create_time倒序（第一条应是最新的）
	assert.Equal(t, "管理员", result.List[0].UserName)
}

func TestSyncLogsHandler_CustomPageSize(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	user := &model.SysUser{ID: 200, Username: "user2", Nickname: "用户二", Password: "xxx", StorageRoot: "/root", Role: 2}
	require.NoError(t, db.Create(user).Error)

	now := time.Now()
	for i := 0; i < 15; i++ {
		userID := int64(200)
		log := &model.SysOperationLog{
			UserID:     &userID,
			OperType:   2,
			OperDesc:   "custom log " + fmt.Sprintf("%d", i),
			CreateTime: now.Add(-time.Duration(i) * time.Minute),
		}
		require.NoError(t, db.Create(log).Error)
	}

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs?page=1&pageSize=5", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(15), result.Total)
	assert.Len(t, result.List, 5)
}

func TestSyncLogsHandler_Page2(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	user := &model.SysUser{ID: 300, Username: "user3", Nickname: "用户三", Password: "xxx", StorageRoot: "/root", Role: 2}
	require.NoError(t, db.Create(user).Error)

	now := time.Now()
	for i := 0; i < 10; i++ {
		userID := int64(300)
		log := &model.SysOperationLog{
			UserID:     &userID,
			OperType:   3,
			OperDesc:   "page2 log " + fmt.Sprintf("%d", i),
			CreateTime: now.Add(-time.Duration(i) * time.Minute),
		}
		require.NoError(t, db.Create(log).Error)
	}

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs?page=2&pageSize=4", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(10), result.Total)
	assert.Len(t, result.List, 4, "第二页应返回4条")
}

func TestSyncLogsHandler_PageSizeExceedsMax(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs?pageSize=200", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	// pageSize=200 超过 100 上限，应截断为 100
	assert.LessOrEqual(t, len(result.List), 100)
}

func TestSyncLogsHandler_InvalidPageDefaults(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	user := &model.SysUser{ID: 400, Username: "user4", Nickname: "用户四", Password: "xxx", StorageRoot: "/root", Role: 2}
	require.NoError(t, db.Create(user).Error)

	now := time.Now()
	for i := 0; i < 5; i++ {
		userID := int64(400)
		log := &model.SysOperationLog{
			UserID:     &userID,
			OperType:   4,
			OperDesc:   "invalid page test " + fmt.Sprintf("%d", i),
			CreateTime: now.Add(-time.Duration(i) * time.Minute),
		}
		require.NoError(t, db.Create(log).Error)
	}

	handler := newSyncLogsHandler(db)

	// page=abc, pageSize=xyz → 应使用默认值 page=1, pageSize=20
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs?page=abc&pageSize=xyz", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(5), result.Total)
	// page默认为1, pageSize默认为20，但只有5条数据，所以返回5条
	assert.Len(t, result.List, 5)
}

func TestSyncLogsHandler_NoUserIDFilter(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	// 创建两个不同用户
	user1 := &model.SysUser{ID: 500, Username: "user5a", Nickname: "用户五A", Password: "xxx", StorageRoot: "/r1", Role: 2}
	user2 := &model.SysUser{ID: 501, Username: "user5b", Nickname: "用户五B", Password: "xxx", StorageRoot: "/r2", Role: 2}
	require.NoError(t, db.Create(user1).Error)
	require.NoError(t, db.Create(user2).Error)

	now := time.Now()
	for _, uid := range []int64{500, 501} {
		userID := uid
		log := &model.SysOperationLog{
			UserID:     &userID,
			OperType:   5,
			OperDesc:   "no filter test",
			CreateTime: now,
		}
		require.NoError(t, db.Create(log).Error)
	}

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))
	assert.Equal(t, int64(2), result.Total, "管理员视角不限user_id，应返回所有用户的日志")
}

func TestSyncLogsHandler_OrderByCreateTimeDesc(t *testing.T) {
	db := setupSyncLogsTestDB(t)

	user := &model.SysUser{ID: 600, Username: "user6", Nickname: "用户六", Password: "xxx", StorageRoot: "/root", Role: 2}
	require.NoError(t, db.Create(user).Error)

	baseTime := time.Date(2026, 6, 27, 10, 0, 0, 0, time.UTC)
	userID := int64(600)

	// 按时间顺序插入：oldest first
	log1 := &model.SysOperationLog{UserID: &userID, OperType: 6, OperDesc: "oldest", CreateTime: baseTime}
	log2 := &model.SysOperationLog{UserID: &userID, OperType: 6, OperDesc: "middle", CreateTime: baseTime.Add(1 * time.Hour)}
	log3 := &model.SysOperationLog{UserID: &userID, OperType: 6, OperDesc: "newest", CreateTime: baseTime.Add(2 * time.Hour)}
	require.NoError(t, db.Create(log1).Error)
	require.NoError(t, db.Create(log2).Error)
	require.NoError(t, db.Create(log3).Error)

	handler := newSyncLogsHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/storage/sync/logs", nil)

	handler.SyncLogsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var result syncLogsResp
	require.NoError(t, json.Unmarshal(dataJSON, &result))

	require.Len(t, result.List, 3)
	assert.Equal(t, "newest", result.List[0].OperDesc, "第一条应是最新的")
	assert.Equal(t, "middle", result.List[1].OperDesc, "第二条应是中间的")
	assert.Equal(t, "oldest", result.List[2].OperDesc, "第三条应是最旧的")
}
