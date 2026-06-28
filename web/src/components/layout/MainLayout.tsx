import React, { useState, useMemo, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Space, Typography, Button, Tag, Badge } from 'antd';
import type { MenuProps } from 'antd';
import {
  FolderOpenOutlined,
  UploadOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  GlobalOutlined,
  StarOutlined,
  HistoryOutlined,
  UsergroupAddOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { logout as logoutApi } from '@/api';
import { getServerInfo } from '@/api/admin';
import TaskManagerButton from '@/components/task/TaskManagerButton';
import TaskManagerPanel from '@/components/task/TaskManagerPanel';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

function MainLayout(): React.ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const [serverOnline, setServerOnline] = useState(false);

  useEffect(() => {
    getServerInfo()
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false));
  }, []);

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      { key: '/files', icon: <FolderOpenOutlined />, label: '文件管理' },
      { key: '/upload', icon: <UploadOutlined />, label: '上传文件' },
      { key: '/tasks', icon: <ClockCircleOutlined />, label: '任务中心' },
      { key: '/public', icon: <GlobalOutlined />, label: '公共空间' },
      { key: '/favorites', icon: <StarOutlined />, label: '我的收藏' },
      { key: '/logs', icon: <HistoryOutlined />, label: '操作记录' },
      { key: '/share/my', icon: <ShareAltOutlined />, label: '我的分享' },
      { key: '/share/received', icon: <ShareAltOutlined />, label: '收到的分享' },
      { key: '/recycle', icon: <DeleteOutlined />, label: '回收站' },
    ];

    return items;
  }, []);

  // 计算当前选中的菜单 key
  const selectedKey = useMemo(() => {
    const path = location.pathname;
    // 先精确匹配
    if (menuItems.some((item) => item && 'key' in item && item.key === path)) {
      return path;
    }
    if (path.startsWith('/share/')) {
      return path;
    }
    return path;
  }, [location.pathname, menuItems]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // 即使登出 API 失败也清除本地状态
    }
    logout();
    navigate('/login', { replace: true });
  };

  const userMenuItems: MenuProps['items'] = [
    { key: 'center', icon: <UserOutlined />, label: '个人中心' },
    { key: 'friends', icon: <UsergroupAddOutlined />, label: '我的好友' },
    ...(user?.role === 1
      ? [{ key: 'admin', icon: <SafetyCertificateOutlined />, label: '后台管理' }]
      : []),
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'center') {
      navigate('/user-center/profile');
    } else if (key === 'friends') {
      navigate('/friends/list');
    } else if (key === 'admin') {
      navigate('/admin-panel/users');
    } else if (key === 'logout') {
      handleLogout();
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 16 : 20,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {collapsed ? 'FH' : 'File Hub'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={[]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Space>
            <TaskManagerButton />
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
        <TaskManagerPanel />
      </Layout>
    </Layout>
  );
}

export default MainLayout;
