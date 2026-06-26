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

func setupFolderTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.Folder{}, &model.SysUser{})
	require.NoError(t, err)
	return db
}

func newFolderHandler(db *gorm.DB) *FolderHandler {
	storageService := &service.StorageService{
		DB:         db,
		UserRepo:   &repository.UserRepo{DB: db},
		FolderRepo: &repository.FolderRepo{DB: db},
		FileRepo:   &repository.FileRepo{DB: db},
	}
	return &FolderHandler{
		FolderRepo:     &repository.FolderRepo{DB: db},
		StorageService: storageService,
	}
}

func seedTestUser(t *testing.T, db *gorm.DB) *model.SysUser {
	t.Helper()
	user := &model.SysUser{
		Username:     "testuser",
		Password:     "hashed",
		Nickname:     "测试用户",
		Role:         2,
		StorageRoot:  "/data/user_testuser",
		StorageQuota: 107374182400,
		Status:       1,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func seedFolders(t *testing.T, db *gorm.DB, userID int64) {
	t.Helper()
	pubVal := int8(1)
	privVal := int8(0)
	folders := []model.Folder{
		{UserID: userID, ParentID: 0, FolderName: "公开文件夹", FullPath: "/data/user_testuser/公开文件夹", IsPublic: &pubVal},
		{UserID: userID, ParentID: 0, FolderName: "私有文件夹", FullPath: "/data/user_testuser/私有文件夹", IsPublic: &privVal},
		{UserID: userID, ParentID: 0, FolderName: "未设置可见性", FullPath: "/data/user_testuser/未设置可见性", IsPublic: nil},
	}
	for i := range folders {
		require.NoError(t, db.Create(&folders[i]).Error)
	}
}

// ======================== GetTree ========================

func TestGetTree_AllFolders(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)
	seedFolders(t, db, user.ID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Parse tree nodes
	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 3) // All 3 root folders
}

func TestGetTree_PublicOnly(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)
	seedFolders(t, db, user.ID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree?isPublic=1", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 1)
	assert.Equal(t, "公开文件夹", nodes[0].FolderName)
}

func TestGetTree_PrivateOnly(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)
	seedFolders(t, db, user.ID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree?isPublic=0", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 1)
	assert.Equal(t, "私有文件夹", nodes[0].FolderName)
}

func TestGetTree_InvalidIsPublicParam(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)
	seedFolders(t, db, user.ID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree?isPublic=invalid", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// Invalid parse → isPublic remains nil → returns all
	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 3)
}

func TestGetTree_EmptyResult(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)
	// No folders seeded

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 0)
}

func TestGetTree_WithChildren(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	// Create parent and child structure
	parent := &model.Folder{UserID: user.ID, ParentID: 0, FolderName: "Parent", FullPath: "/data/user_testuser/Parent"}
	require.NoError(t, db.Create(parent).Error)
	child := &model.Folder{UserID: user.ID, ParentID: parent.ID, FolderName: "Child", FullPath: "/data/user_testuser/Parent/Child"}
	require.NoError(t, db.Create(child).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	assert.Len(t, nodes, 1)
	assert.Equal(t, "Parent", nodes[0].FolderName)
	assert.Len(t, nodes[0].Children, 1)
	assert.Equal(t, "Child", nodes[0].Children[0].FolderName)
}

func TestGetTree_OrphanNodeBecomesRoot(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	// Create node with parent ID that doesn't exist (orphan)
	orphan := &model.Folder{UserID: user.ID, ParentID: 9999, FolderName: "Orphan", FullPath: "/data/user_testuser/Orphan"}
	require.NoError(t, db.Create(orphan).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/folders/tree", nil)
	c.Set("user_id", user.ID)

	handler.GetTree(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	dataJSON, _ := json.Marshal(resp.Data)
	var nodes []FolderTreeNode
	require.NoError(t, json.Unmarshal(dataJSON, &nodes))
	// Orphan should appear as root since its parent doesn't exist
	assert.Len(t, nodes, 1)
	assert.Equal(t, "Orphan", nodes[0].FolderName)
}

// ======================== CreateFolder ========================

func TestCreateFolder_WithIsPublic(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	body := `{"parentId":0,"folderName":"新文件夹","isPublic":1}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID)

	handler.CreateFolder(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Verify isPublic stored
	var folder model.Folder
	require.NoError(t, db.Where("folder_name = ? AND user_id = ?", "新文件夹", user.ID).First(&folder).Error)
	require.NotNil(t, folder.IsPublic)
	assert.Equal(t, int8(1), *folder.IsPublic)
}

func TestCreateFolder_IsPublicPrivate(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	body := `{"parentId":0,"folderName":"私有","isPublic":0}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID)

	handler.CreateFolder(c)

	assert.Equal(t, 200, w.Code)
	var folder model.Folder
	require.NoError(t, db.Where("folder_name = ? AND user_id = ?", "私有", user.ID).First(&folder).Error)
	require.NotNil(t, folder.IsPublic)
	assert.Equal(t, int8(0), *folder.IsPublic)
}

func TestCreateFolder_WithoutIsPublic(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	body := `{"parentId":0,"folderName":"不设置可见性"}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID)

	handler.CreateFolder(c)

	assert.Equal(t, 200, w.Code)
	var folder model.Folder
	require.NoError(t, db.Where("folder_name = ? AND user_id = ?", "不设置可见性", user.ID).First(&folder).Error)
	assert.Nil(t, folder.IsPublic)
}

func TestCreateFolder_WithParent(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	parent := &model.Folder{UserID: user.ID, ParentID: 0, FolderName: "Parent", FullPath: "/data/user_testuser/Parent"}
	require.NoError(t, db.Create(parent).Error)

	body := fmt.Sprintf(`{"parentId":%d,"folderName":"子文件夹","isPublic":0}`, parent.ID)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID)

	handler.CreateFolder(c)

	assert.Equal(t, 200, w.Code)

	var folder model.Folder
	require.NoError(t, db.Where("folder_name = ? AND user_id = ?", "子文件夹", user.ID).First(&folder).Error)
	assert.Equal(t, parent.ID, folder.ParentID)
	assert.Contains(t, folder.FullPath, "Parent/子文件夹")
}

func TestCreateFolder_NameCollision(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	// First creation
	body1 := `{"parentId":0,"folderName":"同名文件夹","isPublic":0}`
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body1))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", user.ID)
	handler.CreateFolder(c1)
	assert.Equal(t, 200, w1.Code)

	// Second creation with same name
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body1))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Set("user_id", user.ID)
	handler.CreateFolder(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
	assert.Contains(t, resp.Msg, "同名")
}

func TestCreateFolder_MissingFolderName(t *testing.T) {
	db := setupFolderTestDB(t)
	handler := newFolderHandler(db)
	user := seedTestUser(t, db)

	body := `{"parentId":0}`
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/folders", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", user.ID)

	handler.CreateFolder(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}


