package discovery

import (
	"testing"
)

func TestNewMDNSService(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		port    int
		lanIP   string
		wantErr bool
	}{
		{
			name:    "valid params",
			host:    "local-file-hub",
			port:    8080,
			lanIP:   "192.168.1.100",
			wantErr: false,
		},
		{
			name:    "invalid ip",
			host:    "test-host",
			port:    3000,
			lanIP:   "not-an-ip",
			wantErr: true, // v1.0.7 校验 IP 格式，无效 IP 返回 error
		},
		{
			name:    "zero port",
			host:    "zero-port",
			port:    0,
			lanIP:   "10.0.0.1",
			wantErr: true, // v1.0.7 校验端口，0 端口返回 error
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, err := newMDNSService(tt.host, tt.port, tt.lanIP)
			if (err != nil) != tt.wantErr {
				t.Errorf("newMDNSService() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if svc == nil && !tt.wantErr {
				t.Error("newMDNSService() returned nil service without error")
			}
			if svc != nil {
				// v1.0.7: Host 字段已重命名为 Instance（映射 NewMDNSService 的第一个参数）
				if svc.Instance != tt.host {
					t.Errorf("expected Instance %q, got %q", tt.host, svc.Instance)
				}
			}
		})
	}
}
