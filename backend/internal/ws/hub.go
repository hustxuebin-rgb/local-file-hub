package ws

import (
	"log"
	"net/http"
	"sync"
	"time"

	"local-file-hub/backend/internal/repository"
	jwtPkg "local-file-hub/backend/pkg/jwt"

	"github.com/gorilla/websocket"
)

// WebSocket 消息类型常量
const (
	MsgTypeDeviceOnline   = "device_online"
	MsgTypeSyncProgress   = "sync_progress"
	MsgTypeUploadProgress = "upload_progress"
	MsgTypeWarnMsg        = "warn_msg"
)

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

// Hub WebSocket 连接管理中心
type Hub struct {
	clients map[int64]*websocket.Conn
	mu      sync.RWMutex
}

// NewHub 创建 Hub 实例
func NewHub() *Hub { return &Hub{clients: make(map[int64]*websocket.Conn)} }

// Register 注册用户 WebSocket 连接
func (h *Hub) Register(userID int64, conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[userID] = conn
	h.mu.Unlock()
	log.Printf("[WS] 用户 %d 已连接", userID)
}

// Unregister 注销用户 WebSocket 连接
func (h *Hub) Unregister(userID int64) {
	h.mu.Lock()
	delete(h.clients, userID)
	h.mu.Unlock()
	log.Printf("[WS] 用户 %d 已断开", userID)
}

// SendToUser 向指定用户发送消息
func (h *Hub) SendToUser(userID int64, msgType string, data interface{}) {
	h.mu.RLock()
	conn, ok := h.clients[userID]
	h.mu.RUnlock()
	if ok {
		conn.WriteJSON(map[string]interface{}{"type": msgType, "data": data})
	}
}

// BroadcastToAdmins 向管理员用户广播消息
func (h *Hub) BroadcastToAdmins(msgType string, data interface{}, adminUserIDs []int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, uid := range adminUserIDs {
		if conn, ok := h.clients[uid]; ok {
			conn.WriteJSON(map[string]interface{}{"type": msgType, "data": data})
		}
	}
}

// HandleWS 处理 WebSocket 连接（含 token 校验、设备上下线、30s 心跳检测）
func (h *Hub) HandleWS(jwtSecret string, deviceRepo *repository.DeviceRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		claims, err := jwtPkg.ParseToken(token, jwtSecret)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		device, err := deviceRepo.FindByToken(token)
		if err != nil {
			http.Error(w, "device not found", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		// 设备上线
		if err := deviceRepo.UpdateOnline(device.ID, 1); err != nil {
			log.Printf("[WS] 更新设备上线状态失败(deviceID=%d): %v", device.ID, err)
		}
		h.Register(claims.UserID, conn)

		defer func() {
			h.Unregister(claims.UserID)
			if err := deviceRepo.UpdateOnline(device.ID, 0); err != nil {
				log.Printf("[WS] 更新设备离线状态失败(deviceID=%d): %v", device.ID, err)
			}
			conn.Close()
		}()

		// 心跳检测：30s 读超时，15s 发一次 ping
		const (
			pingPeriod   = 15 * time.Second
			readDeadline = 30 * time.Second
		)

		conn.SetReadDeadline(time.Now().Add(readDeadline))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(readDeadline))
			return nil
		})

		done := make(chan struct{})
		defer close(done)

		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()

		go func() {
			for {
				select {
				case <-ticker.C:
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						return
					}
				case <-done:
					return
				}
			}
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}
}
