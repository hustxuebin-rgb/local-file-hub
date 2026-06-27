package router

import (
	"local-file-hub/backend/internal/config"
	"local-file-hub/backend/internal/handler"
	"local-file-hub/backend/internal/middleware"
	"local-file-hub/backend/internal/repository"
	"local-file-hub/backend/internal/service"
	"local-file-hub/backend/pkg/response"

	"gorm.io/gorm"

	"github.com/gin-gonic/gin"
)

// SetupRouter 初始化路由
func SetupRouter(cfg *config.Config, db *gorm.DB) *gin.Engine {
	r := gin.Default()

	// 初始化依赖
	userRepo := &repository.UserRepo{DB: db}
	deviceRepo := &repository.DeviceRepo{DB: db}
	folderRepo := &repository.FolderRepo{DB: db}
	fileRepo := &repository.FileRepo{DB: db}
	uploadTaskRepo := &repository.UploadTaskRepo{DB: db}
	operationLogRepo := &repository.OperationLogRepo{DB: db}
	shareRepo := &repository.ShareRepo{DB: db}
	favoriteRepo := &repository.FavoriteRepo{DB: db}

	authService := &service.AuthService{
		UserRepo:   userRepo,
		DeviceRepo: deviceRepo,
		JWTSecret:  cfg.JWT.Secret,
		JWTExpire:  cfg.JWT.AccessExpire,
	}

	storageService := &service.StorageService{
		DB:         db,
		UserRepo:   userRepo,
		FolderRepo: folderRepo,
		FileRepo:   fileRepo,
	}

	uploadService := &service.UploadService{
		DB:             db,
		UploadTaskRepo: uploadTaskRepo,
		FileRepo:       fileRepo,
		UserRepo:       userRepo,
		StorageService: storageService,
		ChunkDir:       cfg.Storage.TempPath,
		MaxFileSize:    cfg.Storage.MaxUploadSize,
	}

	authHandler := &handler.AuthHandler{AuthService: authService}
	deviceHandler := &handler.DeviceHandler{DeviceRepo: deviceRepo}
	folderHandler := &handler.FolderHandler{
		FolderRepo:     folderRepo,
		UserRepo:       userRepo,
		StorageService: storageService,
	}
	fileHandler := &handler.FileHandler{
		UploadService:    uploadService,
		FileRepo:         fileRepo,
		StorageService:   storageService,
		OperationLogRepo: operationLogRepo,
		UserRepo:         userRepo,
	}

	shareService := &service.ShareService{
		ShareRepo:  shareRepo,
		FileRepo:   fileRepo,
		FolderRepo: folderRepo,
		UserRepo:   userRepo,
	}

	shareHandler := &handler.ShareHandler{ShareService: shareService}

	favoriteService := &service.FavoriteService{
		FavoriteRepo: favoriteRepo,
		FileRepo:     fileRepo,
		FolderRepo:   folderRepo,
		ShareRepo:    shareRepo,
		UserRepo:     userRepo,
	}
	favoriteHandler := &handler.FavoriteHandler{FavoriteService: favoriteService}

	storageHandler := &handler.StorageHandler{
		StorageService:   storageService,
		DB:               db,
		OperationLogRepo: operationLogRepo,
	}

	miniappHandler := &handler.MiniappHandler{StorageService: storageService}

	logHandler := &handler.LogHandler{DB: db}
	mediaHandler := &handler.MediaHandler{FileRepo: fileRepo}
	adminHandler := &handler.AdminHandler{
		DB:          db,
		AuthService: authService,
		UserRepo:    userRepo,
	}

	// 注册全局中间件链：CORS → Logger → Auth
	r.Use(middleware.Cors())
	r.Use(middleware.Logger())

	// 免登录路由（在 Auth 中间件之前注册）
	r.GET("/api/folder/public", folderHandler.PublicTree)

	r.Use(middleware.Auth(cfg.JWT.Secret))

	// 健康检查
	r.GET("/api/health", func(c *gin.Context) {
		response.SuccessWithMsg(c, "ok", nil)
	})

	// 认证路由组（无需admin权限）
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/login", authHandler.LoginHandler)
		authGroup.POST("/logout", authHandler.LogoutHandler)
		authGroup.GET("/current_user", authHandler.CurrentUserHandler)
	}

	// 局域网设备管理（需admin权限）
	lanGroup := r.Group("/api/lan")
	lanGroup.Use(middleware.AdminRequired())
	{
		lanGroup.GET("/device_list", deviceHandler.DeviceListHandler)
		lanGroup.POST("/device_kick", deviceHandler.DeviceKickHandler)
	}

	// 免权限的局域网接口
	r.GET("/api/lan/current_device", deviceHandler.CurrentDeviceHandler)
	r.GET("/api/lan/server_info", deviceHandler.ServerInfoHandler)

	// 存储盘管理（需admin权限）
	storageGroup := r.Group("/api/storage")
	storageGroup.Use(middleware.AdminRequired())
	{
		storageGroup.GET("/disk_info", storageHandler.DiskInfoHandler)
		storageGroup.GET("/scan_mounts", storageHandler.ScanMountsHandler)
		storageGroup.GET("/browse_dirs", storageHandler.BrowseDirsHandler)
		storageGroup.POST("/dir", storageHandler.CreateDirHandler)
		storageGroup.DELETE("/dir", storageHandler.DeleteDirHandler)
		storageGroup.GET("/disk_simple", storageHandler.DiskListSimpleHandler)
		storageGroup.GET("/sync_task", storageHandler.SyncTaskHandler)
		storageGroup.PUT("/sync_task", storageHandler.UpdateSyncTaskHandler)
		storageGroup.POST("/sync/manual", storageHandler.ManualSyncHandler)
		storageGroup.GET("/sync/logs", storageHandler.SyncLogsHandler)
		storageGroup.GET("/quota", storageHandler.QuotaHandler)
		storageGroup.POST("/disk", storageHandler.CreateDiskHandler)
		storageGroup.PUT("/disk/:id", storageHandler.UpdateDiskHandler)
		storageGroup.DELETE("/disk/:id", storageHandler.DeleteDiskHandler)
	}

	// 文件夹管理
	folderGroup := r.Group("/api/folder")
	{
		folderGroup.POST("", folderHandler.CreateFolder)
		folderGroup.POST("/batch", folderHandler.BatchCreateFolders)
		folderGroup.GET("", folderHandler.ListFolders)
		folderGroup.GET("/:id", folderHandler.GetFolder)
		folderGroup.PUT("/:id", folderHandler.UpdateFolder)
		folderGroup.DELETE("/:id", folderHandler.DeleteFolder)
		folderGroup.POST("/move", folderHandler.MoveFolder)
		folderGroup.GET("/tree", folderHandler.GetTree)
	}

	// 文件管理
	fileGroup := r.Group("/api/file")
	{
		// 上传子路由组
		uploadGroup := fileGroup.Group("/upload")
		{
			uploadGroup.POST("/init", fileHandler.UploadInit)
			uploadGroup.POST("/chunk", fileHandler.UploadChunk)
			uploadGroup.POST("/merge", fileHandler.UploadMerge)
			uploadGroup.POST("/cancel", fileHandler.UploadCancel)
		}

		// 文件列表
		fileGroup.GET("/list", fileHandler.List)

		// 文件操作
		fileGroup.GET("/:id/info", fileHandler.Info)
		fileGroup.GET("/:id/download", fileHandler.Download)
		fileGroup.GET("/:id/preview", fileHandler.Preview)
		fileGroup.DELETE("/:id", fileHandler.Delete)
		fileGroup.POST("/move", fileHandler.Move)
		fileGroup.PUT("/:id/visibility", fileHandler.UpdateVisibility)

		// 回收站子路由组
		recycleGroup := fileGroup.Group("/recycle")
		{
			recycleGroup.GET("/list", fileHandler.RecycleList)
			recycleGroup.POST("/recover", fileHandler.RecycleRecover)
			recycleGroup.POST("/delete", fileHandler.RecycleDelete)
		}
	}

	// 分享管理
	shareGroup := r.Group("/api/share")
	{
		shareGroup.POST("", shareHandler.CreateHandler)
		shareGroup.POST("/batch", shareHandler.BatchCreateHandler)
		shareGroup.GET("/my", shareHandler.MySharesHandler)
		shareGroup.GET("/received", shareHandler.ReceivedSharesHandler)
		shareGroup.GET("/:id/contents", shareHandler.ContentsHandler)
		shareGroup.PUT("/:id", shareHandler.UpdateHandler)
		shareGroup.DELETE("/:id", shareHandler.CancelHandler)
	}

	// 用户管理（需admin权限）
	userGroup := r.Group("/api/user")
	userGroup.Use(middleware.AdminRequired())
	{
		userGroup.GET("/list", adminHandler.UserListHandler)
		userGroup.POST("/add", adminHandler.AddUserHandler)
		userGroup.PUT("/:id", adminHandler.UpdateUserHandler)
		userGroup.DELETE("/:id", adminHandler.DeleteUserHandler)
		userGroup.GET("/storage_stat", adminHandler.StorageStatHandler)
		userGroup.GET("/search", adminHandler.SearchUserHandler)
	}

	// 日志
	logGroup := r.Group("/api/log")
	logGroup.Use(middleware.AdminRequired())
	{
		logGroup.GET("/operate", logHandler.OperateLogHandler)
		logGroup.GET("/warn", logHandler.WarnLogHandler)
		logGroup.POST("/warn/read", logHandler.ReadWarnHandler)
	}

	// 普通用户日志（无需admin权限）
	r.GET("/api/log/my", logHandler.MyOperateLogHandler)

	// 收藏管理
	favoriteGroup := r.Group("/api/favorite")
	{
		favoriteGroup.POST("", favoriteHandler.AddFavorite)
		favoriteGroup.DELETE("", favoriteHandler.RemoveFavorite)
		favoriteGroup.GET("/list", favoriteHandler.ListFavorites)
	}

	// 公开文件（无需admin权限）
	r.GET("/api/file/public", fileHandler.PublicList)

	// 媒体
	mediaGroup := r.Group("/api/media")
	{
		mediaGroup.GET("/thumbnail/:fileId", mediaHandler.ThumbnailHandler)
		mediaGroup.GET("/video_preview/:fileId", mediaHandler.VideoPreviewHandler)
	}

	// 小程序
	miniappGroup := r.Group("/api/miniapp")
	{
		miniappGroup.POST("/album_upload", miniappHandler.AlbumUploadHandler)
		miniappGroup.POST("/camera_upload", miniappHandler.CameraUploadHandler)
		miniappGroup.GET("/storage_stat", miniappHandler.StorageStatHandler)
	}

	return r
}
