package handler

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
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

func setupShareLogTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.ShareRecord{}, &model.FileInfo{}, &model.SysUser{}, &model.SysOperationLog{})
	require.NoError(t, err)
	// 创建分享者用户
	db.Create(&model.SysUser{ID: 1, Username: "sharer", Nickname: "分享者", Password: "xxx", StorageRoot: "sharer_root", Role: 2})
	return db
}

func newShareHandler(db *gorm.DB) *ShareHandler {
	return &ShareHandler{
		ShareService: &service.ShareService{
			ShareRepo:  &repository.ShareRepo{DB: db},
			FileRepo:   &repository.FileRepo{DB: db},
			FolderRepo: &repository.FolderRepo{DB: db},
			UserRepo:   &repository.UserRepo{DB: db},
		},
	}
}

func newLogHandler(db *gorm.DB) *LogHandler {
	return &LogHandler{DB: db}
}

// seedShareFile 创建一个属于指定用户的测试文件
func seedShareFile(t *testing.T, db *gorm.DB, userID int64, fileName string) int64 {
	t.Helper()
	f := &model.FileInfo{
		UserID:     userID,
		FolderID:   0,
		FileName:   fileName,
		SaveName:   fileName,
		FileSuffix: ".txt",
		FileType:   3,
		FileSize:   1024,
		MD5:        fmt.Sprintf("md5_%s", fileName),
		FullPath:   fmt.Sprintf("/data/%s", fileName),
		Visibility: 0,
		IsDelete:   0,
	}
	require.NoError(t, db.Create(f).Error)
	return f.ID
}

// ======================== BatchCreateShare ========================

func TestBatchCreateShare_Success(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newShareHandler(db)

	// 创建接收用户
	db.Create(&model.SysUser{ID: 2, Username: "receiver1", Nickname: "接收者1", Password: "xxx", StorageRoot: "r1_root", Role: 2})
	db.Create(&model.SysUser{ID: 3, Username: "receiver2", Nickname: "接收者2", Password: "xxx", StorageRoot: "r2_root", Role: 2})

	// 创建 2 个文件（属于 userID=1）
	fileID1 := seedShareFile(t, db, 1, "分享文件1.txt")
	fileID2 := seedShareFile(t, db, 1, "分享文件2.txt")

	body := fmt.Sprintf(`{"items":[{"receiveUserId":2,"resourceId":%d,"shareType":1,"sharePerm":1,"expireType":1},{"receiveUserId":3,"resourceId":%d,"shareType":1,"sharePerm":2,"expireType":1}]}`, fileID1, fileID2)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/share/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.BatchCreateHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 验证返回 2 条成功
	results, ok := resp.Data.([]interface{})
	require.True(t, ok)
	assert.Len(t, results, 2)

	// 验证数据库有 2 条记录
	var count int64
	db.Model(&model.ShareRecord{}).Count(&count)
	assert.Equal(t, int64(2), count)
}

func TestBatchCreateShare_EmptyItems(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newShareHandler(db)

	body := `{"items":[]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/share/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.BatchCreateHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestBatchCreateShare_CannotShareToSelf(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newShareHandler(db)

	fileID := seedShareFile(t, db, 1, "我的文件.txt")

	body := fmt.Sprintf(`{"items":[{"receiveUserId":1,"resourceId":%d,"shareType":1,"sharePerm":1,"expireType":1}]}`, fileID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/share/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.BatchCreateHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 分享给自己会被跳过，返回空列表
	results, ok := resp.Data.([]interface{})
	require.True(t, ok)
	assert.Len(t, results, 0)
}

// ======================== MyOperateLog ========================

func TestMyOperateLog_Empty(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newLogHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/log/my", nil)
	c.Set("user_id", int64(1))

	handler.MyOperateLogHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
	assert.Len(t, data["list"], 0)
}

func TestMyOperateLog_WithData(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newLogHandler(db)

	now := time.Now()
	userID := int64(1)
	db.Create(&model.SysOperationLog{
		UserID:     &userID,
		OperType:   1,
		OperDesc:   "登录系统",
		LocalIP:    "127.0.0.1",
		CreateTime: now,
	})
	db.Create(&model.SysOperationLog{
		UserID:     &userID,
		OperType:   3,
		OperDesc:   "下载文件",
		LocalIP:    "127.0.0.1",
		CreateTime: now.Add(time.Minute),
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/log/my", nil)
	c.Set("user_id", int64(1))

	handler.MyOperateLogHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])
	assert.Len(t, data["list"], 2)
}

func TestMyOperateLog_OperTypeFilter(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newLogHandler(db)

	now := time.Now()
	userID := int64(1)
	db.Create(&model.SysOperationLog{
		UserID:     &userID,
		OperType:   6,
		OperDesc:   "上传文件: test.jpg",
		LocalIP:    "127.0.0.1",
		CreateTime: now,
	})
	db.Create(&model.SysOperationLog{
		UserID:     &userID,
		OperType:   1,
		OperDesc:   "登录系统",
		LocalIP:    "127.0.0.1",
		CreateTime: now.Add(time.Minute),
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/log/my?operType=6", nil)
	c.Set("user_id", int64(1))

	handler.MyOperateLogHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
	list := data["list"].([]interface{})
	item := list[0].(map[string]interface{})
	assert.Contains(t, item["operDesc"], "上传文件")
}

func TestMyOperateLog_Pagination(t *testing.T) {
	db := setupShareLogTestDB(t)
	handler := newLogHandler(db)

	now := time.Now()
	userID := int64(1)
	for i := 1; i <= 5; i++ {
		db.Create(&model.SysOperationLog{
			UserID:     &userID,
			OperType:   1,
			OperDesc:   fmt.Sprintf("操作日志%d", i),
			LocalIP:    "127.0.0.1",
			CreateTime: now.Add(time.Duration(i) * time.Minute),
		})
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/log/my?page=1&size=3", nil)
	c.Set("user_id", int64(1))

	handler.MyOperateLogHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(5), data["total"])
	assert.Len(t, data["list"], 3)
}
