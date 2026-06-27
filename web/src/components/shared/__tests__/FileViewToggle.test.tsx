import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import FileViewToggle from '../FileViewToggle';
import { useViewStore } from '@/stores/useViewStore';

describe('FileViewToggle', () => {
  beforeEach(() => {
    useViewStore.setState({ viewMode: 'list' });
  });

  it('应渲染列表和图标两个选项', () => {
    render(<FileViewToggle />);
    expect(screen.getByText('列表')).toBeInTheDocument();
    expect(screen.getByText('图标')).toBeInTheDocument();
  });

  it('默认选中列表视图', () => {
    render(<FileViewToggle />);
    const listOption = screen.getByText('列表');
    expect(listOption.closest('.ant-segmented-item-selected')).toBeTruthy();
  });

  it('点击图标选项应切换 viewMode', async () => {
    const user = userEvent.setup();
    render(<FileViewToggle />);
    await user.click(screen.getByText('图标'));
    expect(useViewStore.getState().viewMode).toBe('grid');
  });
});
