package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"time"

	"local-file-hub/backend/internal/config"
	"local-file-hub/backend/internal/discovery"
	"local-file-hub/backend/internal/model"
	"local-file-hub/backend/internal/router"
	"local-file-hub/backend/internal/worker"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.LoadConfig("config.yaml")
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	db, err := gorm.Open(mysql.Open(cfg.Database.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	sqlDB, _ := db.DB()
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 自动迁移
	if err := db.AutoMigrate(
		&model.SysUser{},
		&model.SysDevice{},
		&model.StorageDisk{},
		&model.StorageSyncTask{},
		&model.Folder{},
		&model.FileInfo{},
		&model.UploadTask{},
		&model.ShareRecord{},
		&model.SysOperationLog{},
		&model.SysWarnLog{},
	); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// 启动后台清理工作器
	(&worker.CleanupWorker{DB: db}).Start()

	// 启动后台同步工作器
	syncWorker := &worker.SyncWorker{DB: db}
	go syncWorker.Start()

	lanIP := getLanIP()

	// 注册Server设备
	now := time.Now()
	serverDevice := &model.SysDevice{
		UserID:        0,
		DeviceType:    3,
		DeviceName:    "local-file-hub Server",
		LocalIP:       lanIP,
		Token:         "",
		Online:        1,
		LastLoginTime: &now,
	}
	db.Where("device_type = 3 AND local_ip = ?", lanIP).FirstOrCreate(serverDevice)

	r := router.SetupRouter(cfg, db)

	// SPA 静态文件托管 + fallback
	distPath := filepath.Join("..", "web", "dist")
	if _, err := os.Stat(filepath.Join(distPath, "index.html")); err == nil {
		r.NoRoute(func(c *gin.Context) {
			p := c.Request.URL.Path
			fp := filepath.Join(distPath, p)
			if info, err := os.Stat(fp); err == nil && !info.IsDir() {
				c.File(fp)
				return
			}
			c.File(filepath.Join(distPath, "index.html"))
		})
		log.Printf("[SPA] 静态文件托管已启用: %s", distPath)
	}

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	// 启动 mDNS 服务注册
	if lanIP != "" {
		go discovery.StartMDNSService(cfg.Server.Port, lanIP)
	}

	log.Printf("========================================")
	log.Printf("  local-file-hub 服务已启动")
	log.Printf("  本机访问: http://localhost%s", addr)
	if lanIP != "" {
		log.Printf("  局域网访问: http://%s%s", lanIP, addr)
		log.Printf("  mDNS 域名: http://local-file-hub.local%s", addr)
		log.Printf("  小程序配置: API_BASE_URL = 'http://%s%s'", lanIP, addr)
	}
	log.Printf("========================================")
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}

func getLanIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() && ipNet.IP.To4() != nil {
			return ipNet.IP.String()
		}
	}
	return ""
}
