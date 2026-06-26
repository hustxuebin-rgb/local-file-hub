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

func setupAdminTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.SysUser{})
	require.NoError(t, err)
	return db
}

func newAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{
		DB:          db,
		AuthService: &service.AuthService{UserRepo: &repository.UserRepo{DB: db}, JWTSecret: "test-secret", JWTExpire: 0},
		UserRepo:    &repository.UserRepo{DB: db},
	}
}

func seedUsers(t *testing.T, db *gorm.DB, count int) {
	t.Helper()
	for i := 0; i < count; i++ {
		user := &model.SysUser{
			Username:     fmt.Sprintf("user_%d", i),
			Password:     "hashed",
			Nickname:     fmt.Sprintf("昵称_%d", i),
			Role:         2,
			StorageRoot:  fmt.Sprintf("root_%d", i),
			StorageQuota: 107374182400,
			Status:       1,
		}
		require.NoError(t, db.Create(user).Error)
	}
}

// ======================== UserListHandler ========================

func TestUserListHandler_DefaultPagination(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUsers(t, db, 5)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/admin/users", nil)

	handler.UserListHandler(c)

	assert.Equal(t, 200, w.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(5), data["total"])
	assert.Len(t, data["list"], 5)
}

func TestUserListHandler_CustomPagination(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUsers(t, db, 25)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/admin/users?page=2&pageSize=10", nil)

	handler.UserListHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(25), data["total"])
	assert.Len(t, data["list"], 10)
}

func TestUserListHandler_KeywordSearch(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	db.Create(&model.SysUser{Username: "alice", Password: "hashed", Nickname: "Alice Wang", Role: 2, StorageRoot: "root_a", Status: 1})
	db.Create(&model.SysUser{Username: "bob", Password: "hashed", Nickname: "Bob Li", Role: 2, StorageRoot: "root_b", Status: 1})
	db.Create(&model.SysUser{Username: "charlie", Password: "hashed", Nickname: "Charlie Bob", Role: 2, StorageRoot: "root_c", Status: 1})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/admin/users?keyword=bob", nil)

	handler.UserListHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	// Should match bob (username) and Charlie Bob (nickname)
	assert.Equal(t, float64(2), data["total"])
}

func TestUserListHandler_EmptyResult(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUsers(t, db, 3)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/admin/users?keyword=nonexistent", nil)

	handler.UserListHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
	assert.Len(t, data["list"], 0)
}

func TestUserListHandler_PageBoundary(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		wantPage int
	}{
		{"negative page defaults to 1", "page=-1&pageSize=5", 1},
		{"zero page defaults to 1", "page=0&pageSize=5", 1},
		{"pageSize zero defaults to 20", "page=1&pageSize=0", 1},
		{"pageSize over 100 defaults to 20", "page=1&pageSize=200", 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := setupAdminTestDB(t)
			handler := newAdminHandler(db)
			seedUsers(t, db, 5)

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/admin/users?"+tt.query, nil)

			handler.UserListHandler(c)

			assert.Equal(t, 200, w.Code)
		})
	}
}

// ======================== AddUserHandler ========================

func TestAddUserHandler_Success(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)

	body := `{"username":"newuser","password":"pass123","nickname":"新用户","role":1,"storageQuota":500}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/admin/users", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.AddUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Verify user was created with correct storageQuota (MB→bytes)
	var user model.SysUser
	require.NoError(t, db.Where("username = ?", "newuser").First(&user).Error)
	assert.Equal(t, int64(500*1024*1024), user.StorageQuota)
	assert.Equal(t, int8(1), user.Role)
	assert.Contains(t, user.StorageRoot, "user_newuser_")
}

func TestAddUserHandler_MissingRequiredField(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)

	body := `{"password":"pass123","nickname":"新用户"}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/admin/users", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.AddUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestAddUserHandler_DefaultRole(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)

	// role not provided → Go zero value 0, but GORM applies model default:2
	body := `{"username":"norole","password":"pass","nickname":"无角色"}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/admin/users", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	handler.AddUserHandler(c)

	assert.Equal(t, 200, w.Code)

	var user model.SysUser
	require.NoError(t, db.Where("username = ?", "norole").First(&user).Error)
	// GORM default tag: role=2 when not explicitly set
	assert.Equal(t, int8(2), user.Role)
}

func TestAddUserHandler_StorageQuotaConversion(t *testing.T) {
	tests := []struct {
		name          string
		storageQuota  int64
		expectedBytes int64
	}{
		{"100 MB", 100, 100 * 1024 * 1024},
		// GORM default tag overrides storage_quota=0 → 107374182400 (100GB)
		{"0 MB", 0, 107374182400},
		{"1 GB", 1024, 1024 * 1024 * 1024},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db2 := setupAdminTestDB(t)
			h := newAdminHandler(db2)
			body := fmt.Sprintf(`{"username":"%s","password":"pass","nickname":"quota_test","storageQuota":%d}`, tt.name, tt.storageQuota)

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/admin/users", strings.NewReader(body))
			c.Request.Header.Set("Content-Type", "application/json")

			h.AddUserHandler(c)

			assert.Equal(t, 200, w.Code)
			var user model.SysUser
			require.NoError(t, db2.Where("username = ?", tt.name).First(&user).Error)
			assert.Equal(t, tt.expectedBytes, user.StorageQuota)
		})
	}
}

// ======================== UpdateUserHandler ========================

func TestUpdateUserHandler_UpdateNickname(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUser := &model.SysUser{Username: "target", Password: "hashed", Nickname: "旧昵称", Role: 2, StorageRoot: "root_t", Status: 1}
	require.NoError(t, db.Create(seedUser).Error)

	body := fmt.Sprintf(`{"nickname":"新昵称"}`)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/admin/users/"+fmt.Sprint(seedUser.ID), strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(seedUser.ID)}}

	handler.UpdateUserHandler(c)

	assert.Equal(t, 200, w.Code)

	var user model.SysUser
	require.NoError(t, db.First(&user, seedUser.ID).Error)
	assert.Equal(t, "新昵称", user.Nickname)
}

func TestUpdateUserHandler_UpdateStorageQuota(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUser := &model.SysUser{Username: "target", Password: "hashed", Nickname: "User", Role: 2, StorageRoot: "root_t", Status: 1}
	require.NoError(t, db.Create(seedUser).Error)

	body := `{"storageQuota":200}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/admin/users/"+fmt.Sprint(seedUser.ID), strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(seedUser.ID)}}

	handler.UpdateUserHandler(c)

	assert.Equal(t, 200, w.Code)

	var user model.SysUser
	require.NoError(t, db.First(&user, seedUser.ID).Error)
	assert.Equal(t, int64(200*1024*1024), user.StorageQuota) // MB→bytes
}

func TestUpdateUserHandler_UpdateRole(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUser := &model.SysUser{Username: "target", Password: "hashed", Nickname: "User", Role: 2, StorageRoot: "root_t", Status: 1}
	require.NoError(t, db.Create(seedUser).Error)

	body := `{"role":1}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/admin/users/"+fmt.Sprint(seedUser.ID), strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(seedUser.ID)}}

	handler.UpdateUserHandler(c)

	assert.Equal(t, 200, w.Code)

	var user model.SysUser
	require.NoError(t, db.First(&user, seedUser.ID).Error)
	assert.Equal(t, int8(1), user.Role)
}

func TestUpdateUserHandler_UpdateStatus(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUser := &model.SysUser{Username: "target", Password: "hashed", Nickname: "User", Role: 2, StorageRoot: "root_t", Status: 1}
	require.NoError(t, db.Create(seedUser).Error)

	body := `{"status":0}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/admin/users/"+fmt.Sprint(seedUser.ID), strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(seedUser.ID)}}

	handler.UpdateUserHandler(c)

	assert.Equal(t, 200, w.Code)

	var user model.SysUser
	require.NoError(t, db.First(&user, seedUser.ID).Error)
	assert.Equal(t, int8(0), user.Status)
}

func TestUpdateUserHandler_NoFieldsToUpdate(t *testing.T) {
	db := setupAdminTestDB(t)
	handler := newAdminHandler(db)
	seedUser := &model.SysUser{Username: "target", Password: "hashed", Nickname: "User", Role: 2, StorageRoot: "root_t", Status: 1}
	require.NoError(t, db.Create(seedUser).Error)

	body := `{}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/admin/users/"+fmt.Sprint(seedUser.ID), strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(seedUser.ID)}}

	handler.UpdateUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}
