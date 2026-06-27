import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FileCategoryTabs from '../FileCategoryTabs';

describe('FileCategoryTabs', () => {
  it('应渲染所有分类标签', () => {
    render(<FileCategoryTabs activeKey="all" onChange={vi.fn()} />);
    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText('图片')).toBeInTheDocument();
    expect(screen.getByText('视频')).toBeInTheDocument();
    expect(screen.getByText('文档')).toBeInTheDocument();
    expect(screen.getByText('压缩包')).toBeInTheDocument();
    expect(screen.getByText('其他')).toBeInTheDocument();
  });

  it('点击分类应触发 onChange 并传递 fileType', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileCategoryTabs activeKey="all" onChange={onChange} />);
    await user.click(screen.getByText('图片'));
    expect(onChange).toHaveBeenCalledWith('image', 1);
  });

  it('点击"全部"应传递 undefined fileType', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileCategoryTabs activeKey="image" onChange={onChange} />);
    await user.click(screen.getByText('全部'));
    expect(onChange).toHaveBeenCalledWith('all', undefined);
  });
});
