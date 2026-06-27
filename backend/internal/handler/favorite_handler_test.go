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
	assert.Equal(t, 400, resp.Code)
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
