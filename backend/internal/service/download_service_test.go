package service

import (
	"testing"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDownloadTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.DownloadTask{}, &model.FileInfo{})
	require.NoError(t, err)
	return db
}

func newTestDownloadService(db *gorm.DB) *DownloadService {
	return &DownloadService{
		DB:               db,
		DownloadTaskRepo: &repository.DownloadTaskRepo{DB: db},
		FileRepo:         &repository.FileRepo{DB: db},
	}
}

func createTestFile(t *testing.T, db *gorm.DB, fileID, userID int64, fileName string, fileSize int64) *model.FileInfo {
	t.Helper()
	mimeType := "application/octet-stream"
	file := &model.FileInfo{
		ID:       fileID,
		UserID:   userID,
		FileName: fileName,
		FileSize: fileSize,
		MimeType: &mimeType,
		FullPath: "/tmp/test-file",
		MD5:      "abc123",
	}
	require.NoError(t, db.Create(file).Error)
	return file
}

// ======================== InitDownload ========================

func TestInitDownload_NormalCreate(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024*1024)

	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)
	assert.NotEmpty(t, resp.TaskID)
	assert.Equal(t, "test.mp4", resp.FileName)
	assert.Equal(t, int64(1024*1024), resp.TotalSize)
	assert.Equal(t, "application/octet-stream", resp.ContentType)
}

func TestInitDownload_DuplicateReuse(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024*1024)

	// 第一次创建
	resp1, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	// 第二次应复用已有任务
	resp2, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	assert.Equal(t, resp1.TaskID, resp2.TaskID)
}

func TestInitDownload_FileNotFound(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	_, err := svc.InitDownload(1, 9999)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "文件不存在")
}

func TestInitDownload_NotOwnFile(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 2, "other.mp4", 1024) // userID=2

	_, err := svc.InitDownload(1, 1) // userID=1 尝试下载
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "无权下载")
}

func TestInitDownload_DeletedFile(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	file := createTestFile(t, db, 1, 1, "deleted.mp4", 1024)
	db.Model(file).Update("is_delete", int8(1))

	_, err := svc.InitDownload(1, 1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "已被删除")
}

// ======================== PauseDownload ========================

func TestPauseDownload_StatusChanged(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	err = svc.PauseDownload(resp.TaskID)
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusPaused), task.Status)
}

// ======================== CancelDownload ========================

func TestCancelDownload_StatusChanged(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	err = svc.CancelDownload(resp.TaskID)
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusCancelled), task.Status)
}

// ======================== UpdateProgress ========================

func TestUpdateProgress(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024*1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	err = svc.UpdateProgress(resp.TaskID, 512*1024)
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int64(512*1024), task.DownloadedSize)
}

// ======================== ResumeDownload ========================

func TestDownloadResume_Success(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	// 先暂停
	err = svc.PauseDownload(resp.TaskID)
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusPaused), task.Status)

	// 再恢复
	err = svc.ResumeDownload(resp.TaskID)
	require.NoError(t, err)

	task, err = svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusDownloading), task.Status)
}

func TestDownloadResume_NotPaused(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	// 直接恢复（状态是 downloading 而非 paused）
	err = svc.ResumeDownload(resp.TaskID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "暂停状态")
}

// ======================== BatchAction ========================

func TestBatchAction_Pause(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	err = svc.BatchAction(1, []string{resp.TaskID}, "pause")
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusPaused), task.Status)
}

func TestBatchAction_Resume(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	// 先暂停
	err = svc.PauseDownload(resp.TaskID)
	require.NoError(t, err)

	// 批量恢复
	err = svc.BatchAction(1, []string{resp.TaskID}, "resume")
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusDownloading), task.Status)
}

func TestBatchAction_Cancel(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	err = svc.BatchAction(1, []string{resp.TaskID}, "cancel")
	require.NoError(t, err)

	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusCancelled), task.Status)
}

func TestBatchAction_InvalidAction(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	err := svc.BatchAction(1, []string{"some-task"}, "invalid")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "不支持的操作类型")
}

func TestBatchAction_WrongUser(t *testing.T) {
	db := setupDownloadTestDB(t)
	svc := newTestDownloadService(db)

	createTestFile(t, db, 1, 1, "test.mp4", 1024)
	resp, err := svc.InitDownload(1, 1)
	require.NoError(t, err)

	// 用其他用户ID操作（应不影响，因为 WHERE user_id 不匹配）
	err = svc.BatchAction(999, []string{resp.TaskID}, "pause")
	require.NoError(t, err)

	// 原始任务状态应不变
	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, int8(model.DownloadStatusDownloading), task.Status)
}
