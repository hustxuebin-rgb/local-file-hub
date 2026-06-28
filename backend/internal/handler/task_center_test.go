package handler

import (
	"encoding/json"
	"net/http/httptest"
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

func setupTaskCenterTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(&model.DownloadTask{})
	require.NoError(t, err, "auto migrate download_task")

	// UploadTask 含 *time.Time 在部分 SQLite 版本中 AutoMigrate 失败，手动建表
	err = db.Exec(`CREATE TABLE IF NOT EXISTS upload_task (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id BIGINT NOT NULL,
		task_id VARCHAR(64) NOT NULL UNIQUE,
		file_name VARCHAR(255) NOT NULL,
		md5 VARCHAR(32) DEFAULT '',
		total_size BIGINT NOT NULL DEFAULT 0,
		chunk_size INTEGER NOT NULL DEFAULT 0,
		total_chunk INTEGER NOT NULL DEFAULT 0,
		finished_chunk INTEGER NOT NULL DEFAULT 0,
		folder_id BIGINT NOT NULL DEFAULT 0,
		visibility TINYINT NOT NULL DEFAULT 0,
		status TINYINT NOT NULL DEFAULT 1,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		pause_time DATETIME,
		file_path VARCHAR(1024) DEFAULT ''
	)`).Error
	require.NoError(t, err, "create upload_task table")

	err = db.AutoMigrate(&model.FileInfo{})
	require.NoError(t, err, "auto migrate file_info")

	return db
}

func newTaskCenterHandler(db *gorm.DB) *FileHandler {
	downloadTaskRepo := &repository.DownloadTaskRepo{DB: db}
	uploadTaskRepo := &repository.UploadTaskRepo{DB: db}
	fileRepo := &repository.FileRepo{DB: db}

	return &FileHandler{
		DownloadService: &service.DownloadService{
			DB:               db,
			DownloadTaskRepo: downloadTaskRepo,
			FileRepo:         fileRepo,
		},
		UploadService: &service.UploadService{
			DB:             db,
			UploadTaskRepo: uploadTaskRepo,
			FileRepo:       fileRepo,
		},
		UploadTaskRepo: uploadTaskRepo,
	}
}

func seedDownloadTask(t *testing.T, db *gorm.DB, userID int64, taskID string, fileName string, status int8, totalSize int64) {
	t.Helper()
	task := &model.DownloadTask{
		UserID:    userID,
		TaskID:    taskID,
		FileID:    1,
		FileName:  fileName,
		TotalSize: totalSize,
		Status:    status,
	}
	require.NoError(t, db.Create(task).Error)
}

func seedUploadTask(t *testing.T, db *gorm.DB, userID int64, taskID string, fileName string, status int8, totalSize int64) {
	t.Helper()
	task := &model.UploadTask{
		UserID:    userID,
		TaskID:    taskID,
		FileName:  fileName,
		TotalSize: totalSize,
		Status:    status,
	}
	require.NoError(t, db.Create(task).Error)
}

// ======================== TasksHistory ========================

func TestTasksHistory_DownloadDefault(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	seedDownloadTask(t, db, 1, "t1", "video.mp4", model.DownloadStatusCompleted, 1024*1024)
	seedDownloadTask(t, db, 1, "t2", "photo.jpg", model.DownloadStatusFailed, 512*1024)
	seedDownloadTask(t, db, 1, "t3", "doc.pdf", model.DownloadStatusCancelled, 256)
	seedDownloadTask(t, db, 1, "t4", "active.zip", model.DownloadStatusDownloading, 100) // 不应出现

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=download&page=1&pageSize=20", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, int64(3), history.Total)
	assert.Equal(t, 1, history.Page)
	assert.Equal(t, 20, history.PageSize)
}

func TestTasksHistory_KeywordSearch(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	seedDownloadTask(t, db, 1, "t1", "vacation.mp4", model.DownloadStatusCompleted, 1024)
	seedDownloadTask(t, db, 1, "t2", "work-doc.pdf", model.DownloadStatusCompleted, 512)
	seedDownloadTask(t, db, 1, "t3", "another-vacation.jpg", model.DownloadStatusCompleted, 256)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=download&keyword=vacation&page=1&pageSize=20", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, int64(2), history.Total) // vacation.mp4 + another-vacation.jpg
}

func TestTasksHistory_Pagination(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	for i := 0; i < 5; i++ {
		seedDownloadTask(t, db, 1, "task"+string(rune('a'+i)), "file"+string(rune('a'+i))+".txt",
			model.DownloadStatusCompleted, 100)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=download&page=1&pageSize=2", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, int64(5), history.Total)
	assert.Equal(t, 1, history.Page)
	assert.Equal(t, 2, history.PageSize)

	items, ok := history.Items.([]interface{})
	require.True(t, ok)
	assert.Len(t, items, 2)
}

func TestTasksHistory_DataIsolation(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	// user 1 has completed task
	seedDownloadTask(t, db, 1, "t1", "user1-file.txt", model.DownloadStatusCompleted, 100)
	// user 2 has completed task
	seedDownloadTask(t, db, 2, "t2", "user2-file.txt", model.DownloadStatusCompleted, 100)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=download&page=1&pageSize=20", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, int64(1), history.Total)
}

func TestTasksHistory_UploadType(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	seedUploadTask(t, db, 1, "u1", "uploaded.mp4", model.UploadStatusCompleted, 2048)
	seedUploadTask(t, db, 1, "u2", "active-upload.zip", model.UploadStatusUploading, 100) // 不应出现

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=upload&page=1&pageSize=20", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, int64(1), history.Total)
}

func TestTasksHistory_DefaultPagination(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/history?type=download", nil)
	c.Set("user_id", int64(1))

	handler.TasksHistory(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var history TasksHistoryResp
	require.NoError(t, json.Unmarshal(dataJSON, &history))
	assert.Equal(t, 1, history.Page)
	assert.Equal(t, 20, history.PageSize)
}

// ======================== TasksStats ========================

func TestTasksStats_EmptyStats(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/stats", nil)
	c.Set("user_id", int64(1))

	handler.TasksStats(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 无数据也应成功返回
	dataJSON, _ := json.Marshal(resp.Data)
	var stats TasksStatsResp
	require.NoError(t, json.Unmarshal(dataJSON, &stats))
}

func TestTasksStats_DataIsolation(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	// user 1 的已完成下载
	seedDownloadTask(t, db, 1, "t1", "file1.mp4", model.DownloadStatusCompleted, 1024)
	// user 2 的已完成下载（不应计入 user 1 统计）
	seedDownloadTask(t, db, 2, "t2", "file2.mp4", model.DownloadStatusCompleted, 2048)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/file/tasks/stats", nil)
	c.Set("user_id", int64(1))

	handler.TasksStats(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
}

// ======================== TasksBatch ========================

func TestTasksBatch_DownloadPause(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	seedDownloadTask(t, db, 1, "t1", "file.mp4", model.DownloadStatusDownloading, 1024)

	body := `{"taskType":"download","action":"pause","taskIds":["t1"]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 验证状态变更
	var task model.DownloadTask
	require.NoError(t, db.Where("task_id = ?", "t1").First(&task).Error)
	assert.Equal(t, int8(model.DownloadStatusPaused), task.Status)
}

func TestTasksBatch_InvalidAction(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	body := `{"taskType":"download","action":"delete","taskIds":["t1"]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestTasksBatch_EmptyTaskIDs(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	body := `{"taskType":"download","action":"pause","taskIds":[]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestTasksBatch_InvalidTaskType(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	body := `{"taskType":"sync","action":"pause","taskIds":["t1"]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestTasksBatch_DataIsolation(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	// user 2 的任务
	seedDownloadTask(t, db, 2, "t1", "other-file.mp4", model.DownloadStatusDownloading, 1024)

	// user 1 尝试操作 user 2 的任务
	body := `{"taskType":"download","action":"pause","taskIds":["t1"]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// user 2 的任务状态不应被改变
	var task model.DownloadTask
	require.NoError(t, db.Where("task_id = ?", "t1").First(&task).Error)
	assert.Equal(t, int8(model.DownloadStatusDownloading), task.Status)
}

func TestTasksBatch_UploadCancel(t *testing.T) {
	db := setupTaskCenterTestDB(t)
	handler := newTaskCenterHandler(db)

	seedUploadTask(t, db, 1, "u1", "upload-me.jpg", model.UploadStatusUploading, 2048)

	body := `{"taskType":"upload","action":"cancel","taskIds":["u1"]}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/file/tasks/batch", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.TasksBatch(c)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	var task model.UploadTask
	require.NoError(t, db.Where("task_id = ?", "u1").First(&task).Error)
	assert.Equal(t, int8(model.UploadStatusCancelled), task.Status)
}
