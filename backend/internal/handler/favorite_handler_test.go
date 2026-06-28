package handler

import (
	"encoding/json"
	"fmt"
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

func setupFavoriteTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.Favorite{}, &model.FileInfo{}, &model.Folder{},
		&model.ShareRecord{}, &model.SysUser{})
	require.NoError(t, err)
	// 创建测试用户
	db.Create(&model.SysUser{ID: 1, Username: "test", Nickname: "测试用户", Password: "xxx", StorageRoot: "test", Role: 2})
	return db
}

func newFavoriteHandler(db *gorm.DB) *FavoriteHandler {
	return &FavoriteHandler{
		FavoriteService: &service.FavoriteService{
			FavoriteRepo: &repository.FavoriteRepo{DB: db},
			FileRepo:     &repository.FileRepo{DB: db},
			FolderRepo:   &repository.FolderRepo{DB: db},
			ShareRepo:    &repository.ShareRepo{DB: db},
			UserRepo:     &repository.UserRepo{DB: db},
		},
	}
}

// seedTestFile 创建测试文件，返回文件ID
func seedTestFile(t *testing.T, db *gorm.DB, userID int64, fileName string, visibility int8, fileType int8, fileSize int64) int64 {
	t.Helper()
	f := &model.FileInfo{
		UserID:     userID,
		FolderID:   0,
		FileName:   fileName,
		SaveName:   fileName,
		FileSuffix: ".txt",
		FileType:   fileType,
		FileSize:   fileSize,
		MD5:        fmt.Sprintf("md5_%s", fileName),
		FullPath:   fmt.Sprintf("/data/%s", fileName),
		Visibility: visibility,
		IsDelete:   0,
	}
	require.NoError(t, db.Create(f).Error)
	return f.ID
}

// ======================== AddFavorite ========================

func TestAddFavorite_Success(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)
	fileID := seedTestFile(t, db, 1, "测试文件.txt", 0, 1, 1024)

	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.AddFavorite(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 验证数据库有记录
	var fav model.Favorite
	require.NoError(t, db.Where("user_id = ? AND target_type = ? AND target_id = ?", int64(1), int8(1), fileID).First(&fav).Error)
	assert.Equal(t, fileID, fav.TargetID)
}

func TestAddFavorite_AlreadyExists(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)
	fileID := seedTestFile(t, db, 1, "测试文件.txt", 0, 1, 1024)

	// 第一次添加
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)
	assert.Equal(t, 200, w1.Code)

	// 第二次添加相同收藏
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Set("user_id", int64(1))
	handler.AddFavorite(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
	assert.Equal(t, "已收藏", resp.Msg)
}

func TestAddFavorite_InvalidTargetType(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	body := `{"targetType":99,"targetId":1}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.AddFavorite(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestAddFavorite_FileNotFound(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	body := `{"targetType":1,"targetId":9999}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.AddFavorite(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// 文件不存在 → CodeNotFound(404)
	assert.Equal(t, 404, resp.Code)
}

func TestAddFavorite_MissingField(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	body := `{"targetType":1}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.AddFavorite(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

// ======================== RemoveFavorite ========================

func TestRemoveFavorite_Success(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)
	fileID := seedTestFile(t, db, 1, "测试文件.txt", 0, 1, 1024)

	// 先添加
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)

	// 再删除
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("POST", "/api/favorite/remove", strings.NewReader(body))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Set("user_id", int64(1))
	handler.RemoveFavorite(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// 验证数据库无记录
	var count int64
	db.Model(&model.Favorite{}).Where("user_id = ? AND target_type = ? AND target_id = ?", int64(1), int8(1), fileID).Count(&count)
	assert.Equal(t, int64(0), count)
}

func TestRemoveFavorite_NotFound(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	body := `{"targetType":1,"targetId":9999}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite/remove", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))

	handler.RemoveFavorite(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 404, resp.Code)
}

// ======================== ListFavorites ========================

func TestListFavorites_Empty(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
	assert.Len(t, data["list"], 0)
}

func TestListFavorites_WithData(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)
	fileID := seedTestFile(t, db, 1, "我的文件.txt", 0, 1, 2048)

	// 先添加收藏
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)
	assert.Equal(t, 200, w1.Code)

	// 查询列表
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("GET", "/api/favorite", nil)
	c2.Set("user_id", int64(1))

	handler.ListFavorites(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])

	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 1)
	item := list[0].(map[string]interface{})
	assert.Equal(t, "我的文件.txt", item["targetName"])
	assert.Equal(t, "测试用户", item["ownerName"])
}

func TestListFavorites_Pagination(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建 3 个文件并收藏
	for i := 1; i <= 3; i++ {
		fileID := seedTestFile(t, db, 1, fmt.Sprintf("file_%d.txt", i), 0, 1, int64(i*100))
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// 分页查询 page=1&pageSize=2
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?page=1&pageSize=2", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(3), data["total"])
	assert.Len(t, data["list"], 2)
}

// ======================== ListFavorites 过滤测试 ========================

func TestListFavorites_KeywordFilter(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建两个文件并收藏
	fileID1 := seedTestFile(t, db, 1, "我的工作文档.txt", 0, 1, 1024)
	fileID2 := seedTestFile(t, db, 1, "个人照片.png", 0, 1, 2048)

	for _, fid := range []int64{fileID1, fileID2} {
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// keyword=文档 → 只匹配"我的工作文档.txt"
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?keyword=%E6%96%87%E6%A1%A3", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])

	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 1)
	item := list[0].(map[string]interface{})
	assert.Equal(t, "我的工作文档.txt", item["targetName"])
}

func TestListFavorites_KeywordNoMatch(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	fileID := seedTestFile(t, db, 1, "测试文件.txt", 0, 1, 1024)
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)

	// keyword=不存在的关键词 → 返回空列表
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?keyword=xyznotfound", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
	assert.Len(t, data["list"], 0)
}

func TestListFavorites_TargetTypeFilter(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建文件和文件夹并收藏
	fileID := seedTestFile(t, db, 1, "文件A.txt", 0, 1, 1024)
	folder := &model.Folder{UserID: 1, ParentID: 0, FolderName: "文件夹B", FullPath: "/文件夹B"}
	require.NoError(t, db.Create(folder).Error)
	folderID := folder.ID

	// 收藏文件
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)

	// 收藏文件夹
	body2 := fmt.Sprintf(`{"targetType":2,"targetId":%d}`, folderID)
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body2))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Set("user_id", int64(1))
	handler.AddFavorite(c2)

	// targetType=2 → 只返回文件夹
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?targetType=2", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])

	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	item := list[0].(map[string]interface{})
	assert.Equal(t, "文件夹B", item["targetName"])
	assert.Equal(t, float64(2), item["targetType"])
}

func TestListFavorites_CombinedFilter(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建文件并收藏
	fileID1 := seedTestFile(t, db, 1, "项目报告.docx", 0, 1, 1024)
	fileID2 := seedTestFile(t, db, 1, "项目计划.xlsx", 0, 1, 2048)

	for _, fid := range []int64{fileID1, fileID2} {
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// 创建文件夹并收藏
	folder := &model.Folder{UserID: 1, ParentID: 0, FolderName: "项目资料", FullPath: "/项目资料"}
	require.NoError(t, db.Create(folder).Error)
	body := fmt.Sprintf(`{"targetType":2,"targetId":%d}`, folder.ID)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int64(1))
	handler.AddFavorite(c)

	// keyword=项目 + targetType=1 → 只返回两个文件
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("GET", "/api/favorite?keyword=%E9%A1%B9%E7%9B%AE&targetType=1", nil)
	c2.Set("user_id", int64(1))

	handler.ListFavorites(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])
}

func TestListFavorites_KeywordEmptyTargetTypeNil(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	fileID := seedTestFile(t, db, 1, "普通文件.txt", 0, 1, 1024)
	folder := &model.Folder{UserID: 1, ParentID: 0, FolderName: "普通文件夹", FullPath: "/普通文件夹"}
	require.NoError(t, db.Create(folder).Error)

	// 收藏文件和文件夹
	for _, fav := range []struct {
		tt  int8
		tid int64
	}{
		{1, fileID},
		{2, folder.ID},
	} {
		body := fmt.Sprintf(`{"targetType":%d,"targetId":%d}`, fav.tt, fav.tid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// 不带 keyword 和 targetType → 返回全部
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite", nil)
	c.Set("user_id", int64(1))

	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])
}

// ======================== FavoriteRepo ========================

func TestFavoriteRepo_Create(t *testing.T) {
	db := setupFavoriteTestDB(t)
	repo := &repository.FavoriteRepo{DB: db}

	fav := &model.Favorite{
		UserID:     1,
		TargetType: 1,
		TargetID:   100,
	}
	err := repo.Create(fav)
	require.NoError(t, err)
	assert.Greater(t, fav.ID, int64(0))
}

func TestFavoriteRepo_Exists_True(t *testing.T) {
	db := setupFavoriteTestDB(t)
	repo := &repository.FavoriteRepo{DB: db}

	db.Create(&model.Favorite{UserID: 1, TargetType: 1, TargetID: 200})

	exists, err := repo.Exists(1, 1, 200)
	require.NoError(t, err)
	assert.True(t, exists)
}

func TestFavoriteRepo_Exists_False(t *testing.T) {
	db := setupFavoriteTestDB(t)
	repo := &repository.FavoriteRepo{DB: db}

	exists, err := repo.Exists(1, 1, 999)
	require.NoError(t, err)
	assert.False(t, exists)
}

func TestFavoriteRepo_Delete(t *testing.T) {
	db := setupFavoriteTestDB(t)
	repo := &repository.FavoriteRepo{DB: db}

	db.Create(&model.Favorite{UserID: 1, TargetType: 1, TargetID: 300})

	err := repo.Delete(1, 1, 300)
	require.NoError(t, err)

	exists, err := repo.Exists(1, 1, 300)
	require.NoError(t, err)
	assert.False(t, exists)
}

// ======================== ListFavorites 排序测试 ========================

func TestListFavorites_SortByCreateTimeDesc(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 按顺序创建 3 个文件的收藏，create_time 递增
	ids := make([]int64, 3)
	for i := 1; i <= 3; i++ {
		ids[i-1] = seedTestFile(t, db, 1, fmt.Sprintf("file_%d.txt", i), 0, 1, int64(i*100))
	}
	for _, fid := range ids {
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// sortBy=createTime&sortOrder=desc → 最新收藏在前
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=createTime&sortOrder=desc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	// file_3 (最新) 应该排在第一位
	assert.Equal(t, "file_3.txt", list[0].(map[string]interface{})["targetName"])
}

func TestListFavorites_SortByCreateTimeAsc(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	ids := make([]int64, 3)
	for i := 1; i <= 3; i++ {
		ids[i-1] = seedTestFile(t, db, 1, fmt.Sprintf("file_%d.txt", i), 0, 1, int64(i*100))
	}
	for _, fid := range ids {
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// sortBy=createTime&sortOrder=asc → 最早收藏在前
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=createTime&sortOrder=asc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	// file_1 (最早) 应该排在第一位
	assert.Equal(t, "file_1.txt", list[0].(map[string]interface{})["targetName"])
}

func TestListFavorites_SortByTargetName(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建名称无序的文件
	names := []string{"财务报告.txt", "安全日志.txt", "报销单.txt"}
	for _, name := range names {
		fid := seedTestFile(t, db, 1, name, 0, 1, 1024)
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// sortBy=targetName&sortOrder=asc → 按名称升序
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=targetName&sortOrder=asc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	// 按中文字符顺序: "安全日志.txt" < "报销单.txt" < "财务报告.txt"
	assert.Equal(t, "安全日志.txt", list[0].(map[string]interface{})["targetName"])
	assert.Equal(t, "报销单.txt", list[1].(map[string]interface{})["targetName"])
	assert.Equal(t, "财务报告.txt", list[2].(map[string]interface{})["targetName"])
}

func TestListFavorites_SortByTargetNameDesc(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	names := []string{"安全日志.txt", "报销单.txt", "财务报告.txt"}
	for _, name := range names {
		fid := seedTestFile(t, db, 1, name, 0, 1, 1024)
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// sortBy=targetName&sortOrder=desc → 按名称降序
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=targetName&sortOrder=desc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	assert.Equal(t, "财务报告.txt", list[0].(map[string]interface{})["targetName"])
	assert.Equal(t, "报销单.txt", list[1].(map[string]interface{})["targetName"])
	assert.Equal(t, "安全日志.txt", list[2].(map[string]interface{})["targetName"])
}

func TestListFavorites_SortByTargetSize(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建不同大小的文件
	sizes := []int64{300, 100, 200}
	for i, sz := range sizes {
		fid := seedTestFile(t, db, 1, fmt.Sprintf("size_file_%d.txt", i), 0, 1, sz)
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// sortBy=targetSize&sortOrder=asc → 按大小升序
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=targetSize&sortOrder=asc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	// 100 < 200 < 300
	assert.Equal(t, float64(100), list[0].(map[string]interface{})["targetSize"])
	assert.Equal(t, float64(200), list[1].(map[string]interface{})["targetSize"])
	assert.Equal(t, float64(300), list[2].(map[string]interface{})["targetSize"])
}

func TestListFavorites_SortInvalidSortBy(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	fileID := seedTestFile(t, db, 1, "测试.txt", 0, 1, 1024)
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)

	// 非法 sortBy，应回退到 createTime 默认值（不崩溃）
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=malicious;DROP&sortOrder=desc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
}

func TestListFavorites_SortInvalidSortOrder(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	fileID := seedTestFile(t, db, 1, "测试.txt", 0, 1, 1024)
	body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fileID)
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", int64(1))
	handler.AddFavorite(c1)

	// 非法 sortOrder，应回退到 desc
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?sortBy=createTime&sortOrder=evil", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
}

func TestListFavorites_SortWithPagination(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	// 创建 5 个文件，name 分别为 file_A 到 file_E
	for _, ch := range []string{"E", "C", "A", "D", "B"} {
		fid := seedTestFile(t, db, 1, "file_"+ch+".txt", 0, 1, 1024)
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// page=2, pageSize=2, sortBy=targetName, asc → 全量排序后取第2页
	// 排序后: A, B, C, D, E → 第2页(offset=2,limit=2): C, D
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite?page=2&pageSize=2&sortBy=targetName&sortOrder=asc", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(5), data["total"])
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 2)
	assert.Equal(t, "file_C.txt", list[0].(map[string]interface{})["targetName"])
	assert.Equal(t, "file_D.txt", list[1].(map[string]interface{})["targetName"])
}

func TestListFavorites_DefaultSort(t *testing.T) {
	db := setupFavoriteTestDB(t)
	handler := newFavoriteHandler(db)

	ids := make([]int64, 3)
	for i := 1; i <= 3; i++ {
		ids[i-1] = seedTestFile(t, db, 1, fmt.Sprintf("file_%d.txt", i), 0, 1, int64(i*100))
	}
	for _, fid := range ids {
		body := fmt.Sprintf(`{"targetType":1,"targetId":%d}`, fid)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/favorite", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("user_id", int64(1))
		handler.AddFavorite(c)
	}

	// 不带 sortBy/sortOrder，使用默认值 createTime desc
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/favorite", nil)
	c.Set("user_id", int64(1))
	handler.ListFavorites(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 3)
	// 默认 desc，最新在前
	assert.Equal(t, "file_3.txt", list[0].(map[string]interface{})["targetName"])
}

func TestFavoriteRepo_FindByUserID(t *testing.T) {
	db := setupFavoriteTestDB(t)
	repo := &repository.FavoriteRepo{DB: db}

	// 创建 3 条收藏
	for i := 1; i <= 3; i++ {
		db.Create(&model.Favorite{UserID: 1, TargetType: 1, TargetID: int64(i * 100)})
	}

	// 分页查询
	favorites, total, err := repo.FindByUserID(1, 0, 2)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, favorites, 2)
}
