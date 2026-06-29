import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Checkbox, Space, List, Divider, Collapse } from 'antd';
import { UserOutlined, LockOutlined, ScanOutlined, WifiOutlined } from '@ant-design/icons';
import { login } from '@/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { getErrorMessage } from '@/utils/errorCodes';
import type { LoginReq } from '@/types';

const { Title, Text } = Typography;

function LoginPage(): React.ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<string[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const navigate = useNavigate();
  const authLogin = useAuthStore((state) => state.login);

  const onFinish = async (values: LoginReq) => {
    setSubmitting(true);
    try {
      const res = await login({
        ...values,
        deviceType: 1,
      });
      if (res.data) {
        authLogin(res.data.token, res.data.user);
        message.success('登录成功');
        navigate('/files', { replace: true });
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number; msg?: string } } };
      const code = typedErr.response?.data?.code;
      const msg = typedErr.response?.data?.msg;
      message.error(getErrorMessage(code, msg));
    } finally {
      setSubmitting(false);
    }
  };

  const scanNetwork = async () => {
    setScanning(true);
    setDiscoveredServers([]);
    const results: string[] = [];
    const ips = Array.from({ length: 254 }, (_, i) => `192.168.1.${i + 1}`);
    const checks = ips.map((ip) =>
      fetch(`http://${ip}:8080/api/health`, {
        signal: AbortSignal.timeout(500),
      })
        .then((res) => {
          if (res.ok) {
            results.push(`http://${ip}:8080`);
          }
        })
        .catch(() => null),
    );
    await Promise.all(checks);
    setDiscoveredServers(results);
    setScanning(false);
    if (results.length === 0) {
      message.info('未发现可用服务器');
    } else {
      message.success(`发现 ${results.length} 台服务器`);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
          File Hub 登录
        </Title>
        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住我</Checkbox>
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={submitting}
              disabled={submitting}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[{
            key: 'troubleshoot',
            label: '连接不上？',
            children: (
              <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: '#666', lineHeight: 2.2 }}>
                <li>确认服务端已启动（终端应有"服务已启动"日志）</li>
                <li>手机和电脑连接同一WiFi</li>
                <li>尝试用IP直接访问：终端启动日志中的局域网地址</li>
                <li>检查电脑防火墙是否开放 8080 端口</li>
                <li>小程序用户请在电脑浏览器访问服务地址</li>
              </ul>
            ),
          }]}
        />

        <Divider plain>
          <Text type="secondary">网络扫描</Text>
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            icon={<ScanOutlined />}
            block
            loading={scanning}
            disabled={scanning}
            onClick={scanNetwork}
          >
            {scanning ? '正在扫描网络...' : '扫描网络设备 (192.168.1.x)'}
          </Button>

          {discoveredServers.length > 0 && (
            <List
              size="small"
              bordered
              dataSource={discoveredServers}
              renderItem={(server) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background: selectedServer === server ? '#e6f4ff' : undefined,
                  }}
                  onClick={() => setSelectedServer(server)}
                >
                  <WifiOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                  <Text
                    strong={selectedServer === server}
                    type={selectedServer === server ? 'success' : undefined}
                  >
                    {server}
                  </Text>
                  {selectedServer === server && (
                    <Text type="success" style={{ marginLeft: 8 }}>
                      ✓ 已选中
                    </Text>
                  )}
                </List.Item>
              )}
            />
          )}
        </Space>


      </Card>
    </div>
  );
}

export default LoginPage;
