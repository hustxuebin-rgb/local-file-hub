import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FileSearchBar from '../FileSearchBar';

describe('FileSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('应渲染搜索输入框', () => {
    render(<FileSearchBar onSearch={vi.fn()} />);
    expect(screen.getByPlaceholderText('搜索文件')).toBeInTheDocument();
  });

  it('输入文字后 300ms 应触发 onSearch', async () => {
    const onSearch = vi.fn();
    render(<FileSearchBar onSearch={onSearch} />);
    const input = screen.getByPlaceholderText('搜索文件');
    await userEvent.type(input, 'test');
    // 快进 300ms
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledWith('test');
  });

  it('点击搜索按钮应触发 onSearch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn();
    render(<FileSearchBar onSearch={onSearch} />);
    const input = screen.getByPlaceholderText('搜索文件');
    await user.type(input, 'hello');
    // 等待 debounce 完成
    await waitFor(
      () => {
        expect(onSearch).toHaveBeenCalledWith('hello');
      },
      { timeout: 500 },
    );
  });

  it('应使用自定义 placeholder', () => {
    render(<FileSearchBar onSearch={vi.fn()} placeholder="搜索公共文件" />);
    expect(screen.getByPlaceholderText('搜索公共文件')).toBeInTheDocument();
  });
});
