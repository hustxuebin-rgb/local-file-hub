package handler

import (
	"encoding/json"
	"net/http/httptest"
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

func setupPublicFileTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.FileInfo{}, &model.SysUser{}, &model.UploadTask{})
	require.NoError(t, err)
	// 创建测试用户
	db.Create(&model.SysUser{ID: 1, Username: "uploader1", Nickname: "上传者1", Password: "xxx", StorageRoot: "root1", Role: 2})
	db.Create(&model.SysUser{ID: 2, Username: "uploader2", Nickname: "上传者2", Password: "xxx", StorageRoot: "root2", Role: 2})
	return db
}

func newPublicFileHandler(db *gorm.DB) *FileHandler {
	userRepo := &repository.UserRepo{DB: db}
	fileRepo := &repository.FileRepo{DB: db}
	return &FileHandler{
		FileRepo: fileRepo,
		UserRepo: userRepo,
		StorageService: &service.StorageService{
			FileRepo: fileRepo,
		},
	}
}

// ======================== PublicList ========================

func TestPublicList_Empty(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
	assert.Len(t, data["list"], 0)
}

func TestPublicList_WithData(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID:     1,
		FolderID:   0,
		FileName:   "公开文件.jpg",
		SaveName:   "public_file.jpg",
		FileSuffix: ".jpg",
		FileType:   1,
		FileSize:   2048,
		MD5:        "abc123",
		FullPath:   "/data/public_file.jpg",
		Visibility: 1,
		IsDelete:   0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])

	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 1)
	item := list[0].(map[string]interface{})
	assert.Equal(t, "公开文件.jpg", item["fileName"])
	assert.Equal(t, "上传者1", item["uploaderName"])
}

func TestPublicList_ExcludesPrivate(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "公开文件.txt", SaveName: "pub.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "pub_md5",
		FullPath: "/data/pub.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "私有文件.txt", SaveName: "priv.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 200, MD5: "priv_md5",
		FullPath: "/data/priv.txt", Visibility: 0, IsDelete: 0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
	list := data["list"].([]interface{})
	assert.Equal(t, "公开文件.txt", list[0].(map[string]interface{})["fileName"])
}

func TestPublicList_KeywordFilter(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "hello world.txt", SaveName: "hw.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "hw_md5",
		FullPath: "/data/hw.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "goodbye.txt", SaveName: "gb.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 200, MD5: "gb_md5",
		FullPath: "/data/gb.txt", Visibility: 1, IsDelete: 0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files?keyword=hello", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
}

func TestPublicList_FileTypeFilter(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "图片.jpg", SaveName: "img.jpg",
		FileSuffix: ".jpg", FileType: 1, FileSize: 500, MD5: "img_md5",
		FullPath: "/data/img.jpg", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "文档.txt", SaveName: "doc.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 300, MD5: "doc_md5",
		FullPath: "/data/doc.txt", Visibility: 1, IsDelete: 0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files?fileType=1", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
	list := data["list"].([]interface{})
	assert.Equal(t, "图片.jpg", list[0].(map[string]interface{})["fileName"])
}

func TestPublicList_SortByNameAsc(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "ccc.txt", SaveName: "ccc.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "c",
		FullPath: "/data/ccc.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "aaa.txt", SaveName: "aaa.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "a",
		FullPath: "/data/aaa.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "bbb.txt", SaveName: "bbb.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "b",
		FullPath: "/data/bbb.txt", Visibility: 1, IsDelete: 0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files?sortBy=name&sortOrder=asc", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(3), data["total"])
	list := data["list"].([]interface{})
	assert.Equal(t, "aaa.txt", list[0].(map[string]interface{})["fileName"])
	assert.Equal(t, "bbb.txt", list[1].(map[string]interface{})["fileName"])
	assert.Equal(t, "ccc.txt", list[2].(map[string]interface{})["fileName"])
}

func TestPublicList_SortBySizeDesc(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "small.txt", SaveName: "s.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "s",
		FullPath: "/data/s.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "large.txt", SaveName: "l.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 1000, MD5: "l",
		FullPath: "/data/l.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "medium.txt", SaveName: "m.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 500, MD5: "m",
		FullPath: "/data/m.txt", Visibility: 1, IsDelete: 0,
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files?sortBy=fileSize&sortOrder=desc", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list := data["list"].([]interface{})
	assert.Equal(t, "large.txt", list[0].(map[string]interface{})["fileName"])
	assert.Equal(t, "medium.txt", list[1].(map[string]interface{})["fileName"])
	assert.Equal(t, "small.txt", list[2].(map[string]interface{})["fileName"])
}

func TestPublicList_Pagination(t *testing.T) {
	db := setupPublicFileTestDB(t)
	handler := newPublicFileHandler(db)

	for i := 1; i <= 5; i++ {
		db.Create(&model.FileInfo{
			UserID: 1, FolderID: 0,
			FileName:   string(rune('A'+i-1)) + "file.txt",
			SaveName:   string(rune('A'+i-1)) + "f.txt",
			FileSuffix: ".txt", FileType: 3, FileSize: 100 * int64(i),
			MD5:      string(rune('A' + i - 1)),
			FullPath: "/data/f.txt", Visibility: 1, IsDelete: 0,
		})
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/public/files?page=1&pageSize=2", nil)

	handler.PublicList(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(5), data["total"])
	assert.Len(t, data["list"], 2)
}

// ======================== FileRepo.FindPublicFiles ========================

func TestFindPublicFiles_Basic(t *testing.T) {
	db := setupPublicFileTestDB(t)
	repo := &repository.FileRepo{DB: db}

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "pub1.txt", SaveName: "p1.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "p1",
		FullPath: "/data/p1.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 2, FolderID: 0, FileName: "pub2.txt", SaveName: "p2.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 200, MD5: "p2",
		FullPath: "/data/p2.txt", Visibility: 1, IsDelete: 0,
	})

	files, total, err := repo.FindPublicFiles(0, "", nil, "createTime", "desc", 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, files, 2)
}

func TestFindPublicFiles_ExcludesDeleted(t *testing.T) {
	db := setupPublicFileTestDB(t)
	repo := &repository.FileRepo{DB: db}

	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "active.txt", SaveName: "a.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 100, MD5: "a",
		FullPath: "/data/a.txt", Visibility: 1, IsDelete: 0,
	})
	db.Create(&model.FileInfo{
		UserID: 1, FolderID: 0, FileName: "deleted.txt", SaveName: "d.txt",
		FileSuffix: ".txt", FileType: 3, FileSize: 200, MD5: "d",
		FullPath: "/data/d.txt", Visibility: 1, IsDelete: 1,
	})

	files, total, err := repo.FindPublicFiles(0, "", nil, "createTime", "desc", 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, files, 1)
	assert.Equal(t, "active.txt", files[0].FileName)
}
