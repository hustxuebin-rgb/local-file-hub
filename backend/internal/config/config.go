package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// ServerConfig 服务器配置
type ServerConfig struct {
	Port  int    `yaml:"port"`
	Mode  string `yaml:"mode"`
	LanIP string `yaml:"lan_ip"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Host         string `yaml:"host"`
	Port         int    `yaml:"port"`
	User         string `yaml:"user"`
	Password     string `yaml:"password"`
	DBName       string `yaml:"dbname"`
	Charset      string `yaml:"charset"`
	MaxIdleConns int    `yaml:"max_idle_conns"`
	MaxOpenConns int    `yaml:"max_open_conns"`
}

// DSN 返回 MySQL 连接字符串
func (d DatabaseConfig) DSN() string {
	return d.User + ":" + d.Password + "@tcp(" + d.Host + ":" + fmt.Sprint(d.Port) + ")/" + d.DBName +
		"?charset=" + d.Charset + "&parseTime=True&loc=Local"
}

// JWTConfig JWT 配置
type JWTConfig struct {
	Secret       string        `yaml:"secret"`
	AccessExpire time.Duration `yaml:"access_expire"`
}

// StorageConfig 存储配置
type StorageConfig struct {
	MainDiskPath   string   `yaml:"main_disk_path"`
	BackupDiskPath string   `yaml:"backup_disk_path"`
	TempPath       string   `yaml:"temp_path"`
	MaxUploadSize  int64    `yaml:"max_upload_size"`
	DefaultQuota   int64    `yaml:"default_quota"`
	AllowedSuffix  []string `yaml:"allowed_suffix"`
}

// SyncConfig 同步配置
type SyncConfig struct {
	Cron         string   `yaml:"cron"`
	Mode         int      `yaml:"mode"`
	IgnoreSuffix []string `yaml:"ignore_suffix"`
	SpeedLimit   int      `yaml:"speed_limit"`
}

// RecycleConfig 回收站配置
type RecycleConfig struct {
	AutoCleanDays int `yaml:"auto_clean_days"`
}

// MediaConfig 媒体处理配置
type MediaConfig struct {
	ThumbnailSize      int    `yaml:"thumbnail_size"`
	FfmpegPath         string `yaml:"ffmpeg_path"`
	EnableVideoPreview bool   `yaml:"enable_video_preview"`
}

// WebSocketConfig WebSocket 配置
type WebSocketConfig struct {
	HeartbeatInterval time.Duration `yaml:"heartbeat_interval"`
	ReadTimeout       time.Duration `yaml:"read_timeout"`
	WriteTimeout      time.Duration `yaml:"write_timeout"`
}

// AlertConfig 告警配置
type AlertConfig struct {
	DiskUsageThreshold float64       `yaml:"disk_usage_threshold"`
	CheckInterval      time.Duration `yaml:"check_interval"`
}

// LogConfig 日志配置
type LogConfig struct {
	Level    string `yaml:"level"`
	FilePath string `yaml:"file_path"`
}

// Config 应用总配置
type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	JWT       JWTConfig       `yaml:"jwt"`
	Storage   StorageConfig   `yaml:"storage"`
	Sync      SyncConfig      `yaml:"sync"`
	Recycle   RecycleConfig   `yaml:"recycle"`
	Media     MediaConfig     `yaml:"media"`
	WebSocket WebSocketConfig `yaml:"websocket"`
	Alert     AlertConfig     `yaml:"alert"`
	Log       LogConfig       `yaml:"log"`
}

// LoadConfig 从指定路径加载配置文件
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
