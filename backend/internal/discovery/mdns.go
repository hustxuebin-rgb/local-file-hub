package discovery

import (
	"log"
	"net"

	"github.com/hashicorp/mdns"
)

// newMDNSService 创建 mDNS 服务对象（纯构造，无网络操作）
func newMDNSService(host string, port int, lanIP string) (*mdns.MDNSService, error) {
	return mdns.NewMDNSService(
		host,
		"_http._tcp",
		"",
		"",
		port,
		[]net.IP{net.ParseIP(lanIP)},
		[]string{"local-file-hub server"},
	)
}

// StartMDNSService 启动 mDNS 服务注册，使局域网内可通过 local-file-hub.local 访问
func StartMDNSService(port int, lanIP string) {
	host := "local-file-hub"
	service, err := newMDNSService(host, port, lanIP)
	if err != nil {
		log.Printf("mDNS 注册失败: %v", err)
		return
	}
	server, err := mdns.NewServer(&mdns.Config{Zone: service})
	if err != nil {
		log.Printf("mDNS 启动失败: %v", err)
		return
	}
	log.Printf("mDNS 已注册: %s.local:%d", host, port)
	defer server.Shutdown()
}
