package handler

// 操作类型常量
const (
	OperTypeUpload     int8 = 6  // 上传文件
	OperTypeDownload   int8 = 3  // 下载文件
	OperTypeDelete     int8 = 4  // 删除文件（移入回收站）
	OperTypeMove       int8 = 5  // 移动文件
	OperTypeRecover    int8 = 7  // 恢复文件
	OperTypeHardDelete int8 = 8  // 彻底删除文件
	OperTypeVisibility int8 = 9  // 切换可见性
	OperTypeDiskSync   int8 = 10 // 磁盘同步
)
