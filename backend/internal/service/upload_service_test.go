package service

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/repository"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupUploadTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.UploadTask{}, &model.SysUser{}, &model.StorageDisk{}, &model.FileInfo{})
	require.NoError(t, err)
	return db
}

func newTestUploadService(db *gorm.DB, chunkDir string) *UploadService {
	userRepo := &repository.UserRepo{DB: db}
	fileRepo := &repository.FileRepo{DB: db}
	folderRepo := &repository.FolderRepo{DB: db}
	return &UploadService{
		DB:             db,
		UploadTaskRepo: &repository.UploadTaskRepo{DB: db},
		FileRepo:       fileRepo,
		UserRepo:       userRepo,
		StorageService: &StorageService{
			DB:         db,
			UserRepo:   userRepo,
			FolderRepo: folderRepo,
			FileRepo:   fileRepo,
		},
		ChunkDir:    chunkDir,
		MaxFileSize: 1024 * 1024 * 1024, // 1GB
	}
}

func createTestUploadTask(t *testing.T, db *gorm.DB, taskID string, status int8) *model.UploadTask {
	t.Helper()
	task := &model.UploadTask{
		UserID:     1,
		TaskID:     taskID,
		FileName:   "test.mp4",
		TotalSize:  10 * 1024 * 1024,
		ChunkSize:  2 * 1024 * 1024,
		TotalChunk: 5,
		Status:     status,
	}
	require.NoError(t, db.Create(task).Error)
	return task
}

// ======================== GetUploadStatus ========================

func TestGetUploadStatus_ReturnsCorrectFinishedChunks(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-001", model.UploadStatusUploading)

	// 模拟3个已完成分片
	taskChunkDir := filepath.Join(chunkDir, "task-001")
	require.NoError(t, os.MkdirAll(taskChunkDir, 0755))
	for i := 0; i < 3; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(taskChunkDir, strconv.Itoa(i)),
			[]byte("chunk-data"),
			0644,
		))
	}

	resp, err := svc.GetUploadStatus("task-001")
	require.NoError(t, err)
	assert.Equal(t, "task-001", resp.TaskID)
	assert.Equal(t, 3, resp.FinishedCount)
	assert.Equal(t, []int{0, 1, 2}, resp.FinishedChunks)
	assert.Equal(t, 5, resp.TotalChunks)
	assert.Equal(t, float64(60), resp.Progress)
}

func TestGetUploadStatus_NoChunks(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-002", model.UploadStatusUploading)

	resp, err := svc.GetUploadStatus("task-002")
	require.NoError(t, err)
	assert.Equal(t, 0, resp.FinishedCount)
	assert.Empty(t, resp.FinishedChunks)
	assert.Equal(t, float64(0), resp.Progress)
}

func TestGetUploadStatus_NonSequentialChunks(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-003", model.UploadStatusUploading)

	// 模拟乱序分片: 0, 2, 4
	taskChunkDir := filepath.Join(chunkDir, "task-003")
	require.NoError(t, os.MkdirAll(taskChunkDir, 0755))
	for _, idx := range []int{4, 0, 2} {
		require.NoError(t, os.WriteFile(
			filepath.Join(taskChunkDir, strconv.Itoa(idx)),
			[]byte("chunk-data"),
			0644,
		))
	}

	resp, err := svc.GetUploadStatus("task-003")
	require.NoError(t, err)
	assert.Equal(t, 3, resp.FinishedCount)
	// 应排序返回
	assert.Equal(t, []int{0, 2, 4}, resp.FinishedChunks)
}

// ======================== PauseUpload ========================

func TestPauseUpload_StatusChanged(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-pause-1", model.UploadStatusUploading)

	err := svc.PauseUpload("task-pause-1")
	require.NoError(t, err)

	task, err := svc.GetTask("task-pause-1")
	require.NoError(t, err)
	assert.Equal(t, int8(model.UploadStatusPaused), task.Status)
	assert.NotNil(t, task.PauseTime)
}

// ======================== ResumeUpload ========================

func TestResumeUpload_FromPausedToUploading(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-resume-1", model.UploadStatusPaused)

	// 先创建2个已存在分片
	taskChunkDir := filepath.Join(chunkDir, "task-resume-1")
	require.NoError(t, os.MkdirAll(taskChunkDir, 0755))
	for i := 0; i < 2; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(taskChunkDir, strconv.Itoa(i)),
			[]byte("chunk-data"),
			0644,
		))
	}

	resp, err := svc.ResumeUpload("task-resume-1")
	require.NoError(t, err)
	assert.Equal(t, "task-resume-1", resp.TaskID)
	assert.Equal(t, 2, resp.FinishedCount)
	assert.Equal(t, []int{0, 1}, resp.FinishedChunks)

	task, err := svc.GetTask("task-resume-1")
	require.NoError(t, err)
	assert.Equal(t, int8(model.UploadStatusUploading), task.Status)
}

func TestResumeUpload_NotPaused(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-resume-2", model.UploadStatusUploading)

	_, err := svc.ResumeUpload("task-resume-2")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "暂停状态")
}

// ======================== CreateChunk 幂等性 ========================

func TestCreateChunk_Idempotent(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-idempotent", model.UploadStatusUploading)

	// 第一次写入
	err := svc.CreateChunk("task-idempotent", 0, []byte("data"))
	require.NoError(t, err)

	task, err := svc.GetTask("task-idempotent")
	require.NoError(t, err)
	assert.Equal(t, 1, task.FinishedChunk)

	// 第二次写入同一分片，应幂等跳过
	err = svc.CreateChunk("task-idempotent", 0, []byte("different-data"))
	require.NoError(t, err)

	task, err = svc.GetTask("task-idempotent")
	require.NoError(t, err)
	// 进度不应重复递增
	assert.Equal(t, 1, task.FinishedChunk)
}

func TestCreateChunk_MultipleChunksProgress(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-multi", model.UploadStatusUploading)

	for i := 0; i < 3; i++ {
		require.NoError(t, svc.CreateChunk("task-multi", i, []byte("data")))
	}

	task, err := svc.GetTask("task-multi")
	require.NoError(t, err)
	assert.Equal(t, 3, task.FinishedChunk)
}

func TestCreateChunk_PausedState(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-paused-chunk", model.UploadStatusPaused)

	// 暂停状态下仍可接收分片
	err := svc.CreateChunk("task-paused-chunk", 0, []byte("data"))
	require.NoError(t, err)
}

func TestCreateChunk_InvalidStatus(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-completed", model.UploadStatusCompleted)

	err := svc.CreateChunk("task-completed", 0, []byte("data"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "状态异常")
}

// ======================== GetUnfinishedTasks ========================

func TestGetUnfinishedTasks_ReturnsCorrectTasks(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	createTestUploadTask(t, db, "task-uploading", model.UploadStatusUploading)
	createTestUploadTask(t, db, "task-paused", model.UploadStatusPaused)
	createTestUploadTask(t, db, "task-completed", model.UploadStatusCompleted)
	createTestUploadTask(t, db, "task-cancelled", model.UploadStatusCancelled)

	tasks, err := svc.GetUnfinishedTasks(1)
	require.NoError(t, err)
	assert.Len(t, tasks, 2)

	taskIDs := make([]string, len(tasks))
	for i, task := range tasks {
		taskIDs[i] = task.TaskID
	}
	assert.Contains(t, taskIDs, "task-uploading")
	assert.Contains(t, taskIDs, "task-paused")
}

// ======================== calcChunkStrategy ========================

func TestCalcChunkStrategy_SmallFile(t *testing.T) {
	cs, tc := calcChunkStrategy(5 * 1024 * 1024) // 5MB
	assert.Equal(t, 5*1024*1024, cs)
	assert.Equal(t, 1, tc)
}

func TestCalcChunkStrategy_MediumFile(t *testing.T) {
	cs, _ := calcChunkStrategy(50 * 1024 * 1024) // 50MB
	assert.Equal(t, 2*1024*1024, cs)             // 2MB chunks
}

func TestCalcChunkStrategy_LargeFile(t *testing.T) {
	cs, tc := calcChunkStrategy(500 * 1024 * 1024) // 500MB
	assert.Equal(t, 5*1024*1024, cs)               // 5MB chunks
	assert.Equal(t, 100, tc)
}

func TestCalcChunkStrategy_VeryLargeFile(t *testing.T) {
	cs, _ := calcChunkStrategy(2 * 1024 * 1024 * 1024) // 2GB
	assert.Equal(t, 10*1024*1024, cs)                  // 10MB chunks
}

// ======================== scanFinishedChunks ========================

func TestScanFinishedChunks_IgnoresDirectories(t *testing.T) {
	chunkDir := t.TempDir()
	taskChunkDir := filepath.Join(chunkDir, "task-scan")
	require.NoError(t, os.MkdirAll(taskChunkDir, 0755))

	// 普通分片文件
	require.NoError(t, os.WriteFile(filepath.Join(taskChunkDir, "0"), []byte("a"), 0644))
	// 模拟非数字文件名
	require.NoError(t, os.WriteFile(filepath.Join(taskChunkDir, "readme.txt"), []byte("x"), 0644))
	// 子目录
	require.NoError(t, os.MkdirAll(filepath.Join(taskChunkDir, "subdir"), 0755))

	chunks, count := scanFinishedChunks(chunkDir, "task-scan")
	assert.Equal(t, 1, count)
	assert.Equal(t, []int{0}, chunks)
}

func TestScanFinishedChunks_EmptyDir(t *testing.T) {
	chunkDir := t.TempDir()
	// 不创建目录

	chunks, count := scanFinishedChunks(chunkDir, "nonexistent-task")
	assert.Equal(t, 0, count)
	assert.Empty(t, chunks)
}

// ======================== InitUpload with FilePath ========================

func TestInitUpload_WithFilePath(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	// 创建测试用户
	user := &model.SysUser{
		ID:           1,
		Username:     "testuser",
		Password:     "hashed",
		StorageRoot:  "testuser",
		StorageQuota: 1024 * 1024 * 1024, // 1GB
	}
	require.NoError(t, db.Create(user).Error)

	resp, err := svc.InitUpload(1, "test.mp4", 5*1024*1024, "", "/Users/test/video.mp4", 0, 0)
	require.NoError(t, err)
	require.False(t, resp.QuickDone)
	assert.NotEmpty(t, resp.TaskID)

	// 验证 filePath 入库
	task, err := svc.GetTask(resp.TaskID)
	require.NoError(t, err)
	assert.Equal(t, "/Users/test/video.mp4", task.FilePath)
}

// ======================== GetUnfinishedTasks includes FilePath ========================

func TestGetUnfinishedTasks_IncludesFilePath(t *testing.T) {
	db := setupUploadTestDB(t)
	chunkDir := t.TempDir()
	svc := newTestUploadService(db, chunkDir)

	// 创建带 filePath 的上传中任务
	task := &model.UploadTask{
		UserID:     1,
		TaskID:     "task-with-path",
		FileName:   "photo.jpg",
		TotalSize:  5 * 1024 * 1024,
		ChunkSize:  2 * 1024 * 1024,
		TotalChunk: 3,
		Status:     model.UploadStatusUploading,
		FilePath:   "/Users/test/Pictures/photo.jpg",
	}
	require.NoError(t, db.Create(task).Error)

	tasks, err := svc.GetUnfinishedTasks(1)
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	assert.Equal(t, "/Users/test/Pictures/photo.jpg", tasks[0].FilePath)
}
