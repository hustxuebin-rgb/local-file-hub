import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BatchActions from '../BatchActions';

describe('BatchActions', () => {
  const defaultProps = {
    selectedCount: 0,
    totalCount: 5,
    loading: false,
    onSelectAll: vi.fn(),
    onBatchPause: vi.fn(),
    onBatchResume: vi.fn(),
    onBatchCancel: vi.fn(),
  };

  it('should render nothing when totalCount is 0', () => {
    const { container } = render(<BatchActions {...defaultProps} totalCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render all buttons when totalCount > 0', () => {
    render(<BatchActions {...defaultProps} />);

    expect(screen.getByText('全选')).toBeInTheDocument();
    expect(screen.getByText('批量暂停')).toBeInTheDocument();
    expect(screen.getByText('批量恢复')).toBeInTheDocument();
    expect(screen.getByText('批量取消')).toBeInTheDocument();
  });

  it('should disable action buttons when selectedCount is 0', () => {
    render(<BatchActions {...defaultProps} selectedCount={0} />);

    expect(screen.getByText('批量暂停').closest('button')).toBeDisabled();
    expect(screen.getByText('批量恢复').closest('button')).toBeDisabled();
    expect(screen.getByText('批量取消').closest('button')).toBeDisabled();
  });

  it('should enable action buttons when selectedCount > 0', () => {
    render(<BatchActions {...defaultProps} selectedCount={3} />);

    expect(screen.getByText('批量暂停').closest('button')).not.toBeDisabled();
    expect(screen.getByText('批量恢复').closest('button')).not.toBeDisabled();
    expect(screen.getByText('批量取消').closest('button')).not.toBeDisabled();
  });

  it('should show selected count text', () => {
    render(<BatchActions {...defaultProps} selectedCount={3} />);
    expect(screen.getByText('已选 3 项')).toBeInTheDocument();
  });

  it('should call onSelectAll when 全选 clicked', () => {
    const onSelectAll = vi.fn();
    render(<BatchActions {...defaultProps} onSelectAll={onSelectAll} />);
    fireEvent.click(screen.getByText('全选'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });
});
