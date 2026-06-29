import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import BreadcrumbNav from '../BreadcrumbNav';
import type { BreadcrumbItem } from '../BreadcrumbNav';

describe('BreadcrumbNav', () => {
  const sampleItems: BreadcrumbItem[] = [
    { id: null, name: '我的文件' },
    { id: 1, name: '项目文档' },
    { id: 2, name: '前端代码' },
  ];

  it('应正确渲染面包屑路径项', () => {
    render(<BreadcrumbNav items={sampleItems} onClick={vi.fn()} />);

    expect(screen.getByText('我的文件')).toBeInTheDocument();
    expect(screen.getByText('项目文档')).toBeInTheDocument();
    expect(screen.getByText('前端代码')).toBeInTheDocument();
  });

  it('点击非末项应触发 onClick 并传递正确的 index', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<BreadcrumbNav items={sampleItems} onClick={onClick} />);

    // 点击第一个元素（index=0）
    await user.click(screen.getByText('我的文件'));
    expect(onClick).toHaveBeenCalledWith(0);

    // 点击第二个元素（index=1）
    await user.click(screen.getByText('项目文档'));
    expect(onClick).toHaveBeenCalledWith(1);
  });

  it('最后一项不可点击——点击不触发 onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<BreadcrumbNav items={sampleItems} onClick={onClick} />);

    await user.click(screen.getByText('前端代码'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('只有一项时该项不可点击', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const singleItem: BreadcrumbItem[] = [{ id: null, name: '我的文件' }];

    render(<BreadcrumbNav items={singleItem} onClick={onClick} />);

    await user.click(screen.getByText('我的文件'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('空 items 数组时正常渲染不报错', () => {
    const { container } = render(<BreadcrumbNav items={[]} onClick={vi.fn()} />);

    // 应渲染一个空的 nav 元素（Ant Design Breadcrumb 的容器）
    expect(container.querySelector('nav')).toBeInTheDocument();
    // 不应有任何面包屑项
    expect(screen.queryByRole('link')).toBeNull();
  });
});
