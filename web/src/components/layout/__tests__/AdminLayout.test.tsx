import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from '../AdminLayout';

// Mock API
vi.mock('@/api/admin', () => ({
  getServerInfo: vi.fn().mockResolvedValue({ code: 0, msg: 'ok' }),
}));

describe('AdminLayout - Server 状态指示器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderLayout() {
    return render(
      <MemoryRouter initialEntries={['/admin-panel/users']}>
        <AdminLayout />
      </MemoryRouter>,
    );
  }

  it('初始渲染时应显示 Server 离线状态', async () => {
    // Given: getServerInfo 尚未 resolve
    const { getServerInfo } = await import('@/api/admin');
    vi.mocked(getServerInfo).mockImplementation(() => new Promise(() => {}));

    // When: 渲染组件
    renderLayout();

    // Then: 显示离线 Tag (初始状态为 false)
    expect(screen.getByText('Server离线')).toBeInTheDocument();
    expect(screen.getByText('后台管理')).toBeInTheDocument();
  });

  it('API 成功时应显示已连接 Server', async () => {
    // Given: getServerInfo 成功返回
    const { getServerInfo } = await import('@/api/admin');
    vi.mocked(getServerInfo).mockResolvedValue({ code: 0, msg: 'ok' } as never);

    // When: 渲染组件
    renderLayout();

    // Then: 等待状态更新为已连接
    await waitFor(() => {
      expect(screen.getByText('已连接 Server')).toBeInTheDocument();
    });
  });

  it('API 失败时应显示 Server 离线', async () => {
    // Given: getServerInfo 拒绝
    const { getServerInfo } = await import('@/api/admin');
    vi.mocked(getServerInfo).mockRejectedValue(new Error('Network Error'));

    // When: 渲染组件
    renderLayout();

    // Then: 保持离线状态
    await waitFor(() => {
      expect(screen.getByText('Server离线')).toBeInTheDocument();
    });
  });

  it('应显示管理 Tabs 导航项', () => {
    renderLayout();

    expect(screen.getByText('用户管理')).toBeInTheDocument();
    expect(screen.getByText('磁盘管理')).toBeInTheDocument();
  });
});
