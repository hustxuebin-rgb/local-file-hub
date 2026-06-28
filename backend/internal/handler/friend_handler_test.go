package handler

import (
	"encoding/json"
	"errors"
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

func setupFriendTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.SysUser{}, &model.FriendRelation{}, &model.FriendRequest{})
	require.NoError(t, err)
	return db
}

func newFriendHandler(db *gorm.DB) *FriendHandler {
	return &FriendHandler{
		FriendService: &service.FriendService{
			FriendRepo: &repository.FriendRepo{DB: db},
			UserRepo:   &repository.UserRepo{DB: db},
		},
	}
}

func seedFriendUsers(t *testing.T, db *gorm.DB, count int) []int64 {
	t.Helper()
	ids := make([]int64, 0, count)
	for i := 0; i < count; i++ {
		user := &model.SysUser{
			Username:     fmt.Sprintf("user_%d", i+1),
			Password:     "hashed",
			Nickname:     fmt.Sprintf("用户_%d", i+1),
			Role:         2,
			StorageRoot:  fmt.Sprintf("root_%d", i+1),
			StorageQuota: 107374182400,
			Status:       1,
		}
		require.NoError(t, db.Create(user).Error)
		ids = append(ids, user.ID)
	}
	return ids
}

// ======================== SearchUserHandler ========================

func TestSearchUserHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)
	// user_1 (ids[0]) is current user, search for user_2
	currentUserID := ids[0]

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/search?q=user_2", nil)
	c.Set("user_id", currentUserID)

	handler.SearchUserHandler(c)

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
}

func TestSearchUserHandler_ExcludesSelf(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)
	currentUserID := ids[0]

	// Search for "user" which matches both users
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/search?q=user", nil)
	c.Set("user_id", currentUserID)

	handler.SearchUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	// Should exclude self (user_1)
	assert.Equal(t, float64(1), data["total"])
	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 1)
	item := list[0].(map[string]interface{})
	assert.Equal(t, "user_2", item["username"])
}

func TestSearchUserHandler_EmptyQuery(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/search?q=", nil)
	c.Set("user_id", ids[0])

	handler.SearchUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestSearchUserHandler_MarksIsFriend(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)
	currentUserID := ids[0]

	// Create a friend relation: user_1 <-> user_2
	db.Create(&model.FriendRelation{UserID: currentUserID, FriendID: ids[1]})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/search?q=user", nil)
	c.Set("user_id", currentUserID)

	handler.SearchUserHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	list, ok := data["list"].([]interface{})
	require.True(t, ok)

	for _, item := range list {
		m := item.(map[string]interface{})
		if m["username"] == "user_2" {
			assert.True(t, m["isFriend"].(bool))
		} else {
			assert.False(t, m["isFriend"].(bool))
		}
	}
}

// ======================== SendRequestHandler ========================

func TestSendRequestHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	body := fmt.Sprintf(`{"toUserId":%d,"message":"加个好友"}`, ids[1])
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", ids[0])

	handler.SendRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)
	assert.Contains(t, resp.Msg, "已发送")

	// Verify request was created in DB
	var req model.FriendRequest
	require.NoError(t, db.Where("from_user_id = ? AND to_user_id = ?", ids[0], ids[1]).First(&req).Error)
	assert.Equal(t, model.FriendRequestPending, req.Status)
	assert.Equal(t, "加个好友", req.Message)
}

func TestSendRequestHandler_CannotAddSelf(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 1)

	body := fmt.Sprintf(`{"toUserId":%d,"message":"hello"}`, ids[0])
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", ids[0])

	handler.SendRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestSendRequestHandler_AlreadyFriend(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	// Create friend relation
	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})

	body := fmt.Sprintf(`{"toUserId":%d}`, ids[1])
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", ids[0])

	handler.SendRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

func TestSendRequestHandler_DuplicatePending(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	// First request
	body := fmt.Sprintf(`{"toUserId":%d}`, ids[1])
	w1 := httptest.NewRecorder()
	c1, _ := gin.CreateTestContext(w1)
	c1.Request = httptest.NewRequest("POST", "/api/friend/request", strings.NewReader(body))
	c1.Request.Header.Set("Content-Type", "application/json")
	c1.Set("user_id", ids[0])
	handler.SendRequestHandler(c1)
	assert.Equal(t, 200, w1.Code)

	// Duplicate request
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest("POST", "/api/friend/request", strings.NewReader(body))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Set("user_id", ids[0])
	handler.SendRequestHandler(c2)

	assert.Equal(t, 200, w2.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

// ======================== AcceptRequestHandler ========================

func TestAcceptRequestHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	// Create a pending request from ids[0] to ids[1]
	req := &model.FriendRequest{
		FromUserID: ids[0],
		ToUserID:   ids[1],
		Status:     model.FriendRequestPending,
		Message:    "hi",
	}
	require.NoError(t, db.Create(req).Error)

	// ids[1] accepts
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request/"+fmt.Sprint(req.ID)+"/accept", nil)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(req.ID)}}
	c.Set("user_id", ids[1])

	handler.AcceptRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Verify bidirectional relation created
	isFriend, _ := (&repository.FriendRepo{DB: db}).IsFriend(ids[0], ids[1])
	assert.True(t, isFriend)
	isFriend2, _ := (&repository.FriendRepo{DB: db}).IsFriend(ids[1], ids[0])
	assert.True(t, isFriend2)

	// Verify request status updated
	var updatedReq model.FriendRequest
	require.NoError(t, db.First(&updatedReq, req.ID).Error)
	assert.Equal(t, model.FriendRequestAccepted, updatedReq.Status)
}

func TestAcceptRequestHandler_NoPermission(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)

	// Request from ids[0] to ids[1]
	req := &model.FriendRequest{
		FromUserID: ids[0],
		ToUserID:   ids[1],
		Status:     model.FriendRequestPending,
	}
	require.NoError(t, db.Create(req).Error)

	// ids[2] tries to accept (no permission)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request/"+fmt.Sprint(req.ID)+"/accept", nil)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(req.ID)}}
	c.Set("user_id", ids[2])

	handler.AcceptRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 403, resp.Code)
}

func TestAcceptRequestHandler_AlreadyHandled(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	req := &model.FriendRequest{
		FromUserID: ids[0],
		ToUserID:   ids[1],
		Status:     model.FriendRequestAccepted,
	}
	require.NoError(t, db.Create(req).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request/"+fmt.Sprint(req.ID)+"/accept", nil)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(req.ID)}}
	c.Set("user_id", ids[1])

	handler.AcceptRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

// ======================== RejectRequestHandler ========================

func TestRejectRequestHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	req := &model.FriendRequest{
		FromUserID: ids[0],
		ToUserID:   ids[1],
		Status:     model.FriendRequestPending,
	}
	require.NoError(t, db.Create(req).Error)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/friend/request/"+fmt.Sprint(req.ID)+"/reject", nil)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(req.ID)}}
	c.Set("user_id", ids[1])

	handler.RejectRequestHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Verify status updated
	var updatedReq model.FriendRequest
	require.NoError(t, db.First(&updatedReq, req.ID).Error)
	assert.Equal(t, model.FriendRequestRejected, updatedReq.Status)
}

// ======================== ReceivedRequestsHandler ========================

func TestReceivedRequestsHandler_All(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)

	// Create 2 received requests for ids[0]
	db.Create(&model.FriendRequest{FromUserID: ids[1], ToUserID: ids[0], Status: model.FriendRequestPending})
	db.Create(&model.FriendRequest{FromUserID: ids[2], ToUserID: ids[0], Status: model.FriendRequestAccepted})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/requests/received", nil)
	c.Set("user_id", ids[0])

	handler.ReceivedRequestsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])
}

func TestReceivedRequestsHandler_FilterByStatus(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)

	db.Create(&model.FriendRequest{FromUserID: ids[1], ToUserID: ids[0], Status: model.FriendRequestPending})
	db.Create(&model.FriendRequest{FromUserID: ids[2], ToUserID: ids[0], Status: model.FriendRequestAccepted})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/requests/received?status=0", nil)
	c.Set("user_id", ids[0])

	handler.ReceivedRequestsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(1), data["total"])
}

func TestReceivedRequestsHandler_Empty(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 1)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/requests/received", nil)
	c.Set("user_id", ids[0])

	handler.ReceivedRequestsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
}

// ======================== SentRequestsHandler ========================

func TestSentRequestsHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)

	db.Create(&model.FriendRequest{FromUserID: ids[0], ToUserID: ids[1], Status: model.FriendRequestPending})
	db.Create(&model.FriendRequest{FromUserID: ids[0], ToUserID: ids[2], Status: model.FriendRequestRejected})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/requests/sent", nil)
	c.Set("user_id", ids[0])

	handler.SentRequestsHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])
}

// ======================== FriendListHandler ========================

func TestFriendListHandler_Empty(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 1)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/list", nil)
	c.Set("user_id", ids[0])

	handler.FriendListHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(0), data["total"])
}

func TestFriendListHandler_WithFriends(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 3)

	// Create friend relations: ids[0] <-> ids[1], ids[0] <-> ids[2]
	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})
	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[2]})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/list", nil)
	c.Set("user_id", ids[0])

	handler.FriendListHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), data["total"])

	list, ok := data["list"].([]interface{})
	require.True(t, ok)
	assert.Len(t, list, 2)

	// Verify friend info
	item := list[0].(map[string]interface{})
	assert.NotEmpty(t, item["username"])
	assert.NotEmpty(t, item["nickname"])
}

// ======================== DeleteFriendHandler ========================

func TestDeleteFriendHandler_Success(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	// Create friend relation
	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})
	db.Create(&model.FriendRelation{UserID: ids[1], FriendID: ids[0]})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/api/friend/"+fmt.Sprint(ids[1]), nil)
	c.Params = gin.Params{{Key: "friendId", Value: fmt.Sprint(ids[1])}}
	c.Set("user_id", ids[0])

	handler.DeleteFriendHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 200, resp.Code)

	// Verify both directions deleted
	var count int64
	db.Model(&model.FriendRelation{}).Where("user_id = ? AND friend_id = ?", ids[0], ids[1]).Count(&count)
	assert.Equal(t, int64(0), count)
	db.Model(&model.FriendRelation{}).Where("user_id = ? AND friend_id = ?", ids[1], ids[0]).Count(&count)
	assert.Equal(t, int64(0), count)
}

func TestDeleteFriendHandler_NotFriend(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/api/friend/"+fmt.Sprint(ids[1]), nil)
	c.Params = gin.Params{{Key: "friendId", Value: fmt.Sprint(ids[1])}}
	c.Set("user_id", ids[0])

	handler.DeleteFriendHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 400, resp.Code)
}

// ======================== CheckFriendHandler ========================

func TestCheckFriendHandler_True(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/check/"+fmt.Sprint(ids[1]), nil)
	c.Params = gin.Params{{Key: "userId", Value: fmt.Sprint(ids[1])}}
	c.Set("user_id", ids[0])

	handler.CheckFriendHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.True(t, data["isFriend"].(bool))
}

func TestCheckFriendHandler_False(t *testing.T) {
	db := setupFriendTestDB(t)
	handler := newFriendHandler(db)
	ids := seedFriendUsers(t, db, 2)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/friend/check/"+fmt.Sprint(ids[1]), nil)
	c.Params = gin.Params{{Key: "userId", Value: fmt.Sprint(ids[1])}}
	c.Set("user_id", ids[0])

	handler.CheckFriendHandler(c)

	assert.Equal(t, 200, w.Code)
	var resp response.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.False(t, data["isFriend"].(bool))
}

// ======================== FriendRepo ========================

func TestFriendRepo_CreateFriendRelation(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	err := repo.CreateFriendRelation(ids[0], ids[1])
	require.NoError(t, err)

	isFriend, err := repo.IsFriend(ids[0], ids[1])
	require.NoError(t, err)
	assert.True(t, isFriend)
}

func TestFriendRepo_DeleteFriendRelation(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	// Create bidirectional relations
	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})
	db.Create(&model.FriendRelation{UserID: ids[1], FriendID: ids[0]})

	err := repo.DeleteFriendRelation(ids[0], ids[1])
	require.NoError(t, err)

	var count int64
	db.Model(&model.FriendRelation{}).Count(&count)
	assert.Equal(t, int64(0), count)
}

func TestFriendRepo_IsFriend_True(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	db.Create(&model.FriendRelation{UserID: ids[0], FriendID: ids[1]})

	isFriend, err := repo.IsFriend(ids[0], ids[1])
	require.NoError(t, err)
	assert.True(t, isFriend)
}

func TestFriendRepo_IsFriend_False(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	isFriend, err := repo.IsFriend(ids[0], ids[1])
	require.NoError(t, err)
	assert.False(t, isFriend)
}

func TestFriendRepo_FindPendingRequest(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	db.Create(&model.FriendRequest{FromUserID: ids[0], ToUserID: ids[1], Status: model.FriendRequestPending})

	req, err := repo.FindPendingRequest(ids[0], ids[1])
	require.NoError(t, err)
	assert.Equal(t, ids[0], req.FromUserID)
	assert.Equal(t, ids[1], req.ToUserID)
}

func TestFriendRepo_FindPendingRequest_NotFound(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	_, err := repo.FindPendingRequest(ids[0], ids[1])
	assert.Error(t, err)
	assert.True(t, errors.Is(err, gorm.ErrRecordNotFound))
}

func TestFriendRepo_UpdateRequestStatus(t *testing.T) {
	db := setupFriendTestDB(t)
	ids := seedFriendUsers(t, db, 2)
	repo := &repository.FriendRepo{DB: db}

	req := &model.FriendRequest{FromUserID: ids[0], ToUserID: ids[1], Status: model.FriendRequestPending}
	require.NoError(t, db.Create(req).Error)

	err := repo.UpdateRequestStatus(req.ID, model.FriendRequestAccepted)
	require.NoError(t, err)

	var updated model.FriendRequest
	require.NoError(t, db.First(&updated, req.ID).Error)
	assert.Equal(t, model.FriendRequestAccepted, updated.Status)
}
