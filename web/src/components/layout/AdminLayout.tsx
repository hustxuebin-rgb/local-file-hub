import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Space, Typography, Tag, Badge } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  ShareAltOutlined,
  FileTextOutlined,
  BellOutlined,
  LogoutOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { logout as logoutApi } from '@/api';
import { getServerInfo } from '@/api/admin';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

const menuItems: MenuItem[] = [
  { key: '/admin-panel/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/admin-panel/disks', icon: <SettingOutlined />, label: '磁盘管理' },
  { key: '/admin-panel/shares', icon: <ShareAltOutlined />, label: '分享审计' },
  { key: '/admin-panel/sync-logs', icon: <FileTextOutlined />, label: '同步日志' },
  { key: '/admin-panel/alerts', icon: <BellOutlined />, label: '告警管理' },
];

function AdminLayout(): React.ReactNode {
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
    { key: 'center', icon: <UserOutlined />, label: '个人中心' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'home') {
      navigate('/files');
    } else if (key === 'center') {
      navigate('/user-center/profile');
    } else if (key === 'logout') {
      handleLogout();
    }
  };

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (menuItems.some((item) => item && 'key' in item && item.key === path)) {
      return path;
    }
    return '/admin-panel/users';
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
          后台管理
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

export default AdminLayout;
