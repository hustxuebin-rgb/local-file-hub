import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FileSortDropdown from '../FileSortDropdown';
import type { SortOption } from '@/types';

describe('FileSortDropdown', () => {
  const defaultSort: SortOption = { field: 'createTime', order: 'desc' };

  it('应渲染排序按钮', () => {
    render(<FileSortDropdown value={defaultSort} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /上传时间 ↓/ })).toBeInTheDocument();
  });

  it('点击排序按钮应显示下拉菜单', async () => {
    const user = userEvent.setup();
    render(<FileSortDropdown value={defaultSort} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /上传时间 ↓/ }));
    await waitFor(() => {
      expect(screen.getByText('文件名称 ↑')).toBeInTheDocument();
      expect(screen.getByText('文件大小 ↓')).toBeInTheDocument();
    });
  });

  it('选择排序选项应触发 onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileSortDropdown value={defaultSort} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /上传时间 ↓/ }));
    await waitFor(() => {
      expect(screen.getByText('文件名称 ↑')).toBeInTheDocument();
    });
    await user.click(screen.getByText('文件名称 ↑'));
    expect(onChange).toHaveBeenCalledWith({ field: 'name', order: 'asc' });
  });
});
