import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Space, Typography, Tag, Badge } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { logout as logoutApi } from '@/api';
import { getServerInfo } from '@/api/admin';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

const menuItems: MenuItem[] = [
  { key: '/user-center/profile', icon: <UserOutlined />, label: '个人资料' },
  { key: '/user-center/storage', icon: <DatabaseOutlined />, label: '存储配额' },
  { key: '/user-center/logs', icon: <HistoryOutlined />, label: '操作记录' },
];

function UserCenterLayout(): React.ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const [serverOnline, setServerOnline] = useState(false);

  useEffect(() => {
    getServerInfo()
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false));
  }, []);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // ignore
    }
    logout();
    navigate('/login', { replace: true });
  };

  const userMenuItems: MenuProps['items'] = [
    { key: 'home', icon: <HomeOutlined />, label: '返回主页' },
    ...(user?.role === 1
      ? [{ key: 'admin', icon: <SafetyCertificateOutlined />, label: '后台管理' }]
      : []),
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'home') {
      navigate('/files');
    } else if (key === 'admin') {
      navigate('/admin-panel/users');
    } else if (key === 'logout') {
      handleLogout();
    }
  };

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (menuItems.some((item) => item && 'key' in item && item.key === path)) {
      return path;
    }
    return '/user-center/profile';
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark">
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          个人中心
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <Space>
            <Tag
              color={serverOnline ? 'success' : 'error'}
              icon={serverOnline ? <Badge status="success" /> : <Badge status="error" />}
            >
              {serverOnline ? '已连接 Server' : 'Server离线'}
            </Tag>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <Text>{user?.nickname ?? user?.username ?? '用户'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default UserCenterLayout;
