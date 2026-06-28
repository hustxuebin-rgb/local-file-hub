import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TaskTable from '../TaskTable';
import type { UnifiedTaskItem } from '@/api/file';

const mockTasks: UnifiedTaskItem[] = [
  {
    taskId: 'task-1',
    taskType: 'upload',
    fileName: 'test-photo.jpg',
    totalSize: 10485760,
    finishedSize: 5242880,
    totalChunk: 10,
    finishedChunk: 5,
    status: 1,
    progress: 50,
    createTime: '2025-06-28T10:00:00Z',
  },
  {
    taskId: 'task-2',
    taskType: 'upload',
    fileName: 'document.pdf',
    totalSize: 2097152,
    finishedSize: 0,
    totalChunk: 5,
    finishedChunk: 0,
    status: 2,
    progress: 0,
    createTime: '2025-06-28T10:05:00Z',
  },
];

describe('TaskTable', () => {
  const defaultProps = {
    tasks: mockTasks,
    loading: false,
    selectedTaskIds: [],
    onSelectChange: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should render table with task data', () => {
    render(<TaskTable {...defaultProps} />);

    expect(screen.getByText('test-photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('should show empty state when no tasks', () => {
    render(<TaskTable {...defaultProps} tasks={[]} />);
    expect(screen.getByText('暂无活跃任务')).toBeInTheDocument();
  });

  it('should render status tags', () => {
    render(<TaskTable {...defaultProps} />);

    // task-1 is status 1 = 进行中
    expect(screen.getByText('进行中')).toBeInTheDocument();
    // task-2 is status 2 = 已暂停
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('should render progress bars', () => {
    const { container } = render(<TaskTable {...defaultProps} />);

    // Ant Design Progress renders aria-label
    const progressBars = container.querySelectorAll('.ant-progress');
    expect(progressBars.length).toBeGreaterThanOrEqual(2);
  });

  it('should render file sizes formatted', () => {
    render(<TaskTable {...defaultProps} />);

    // 10 MB
    expect(screen.getByText('10.0 MB')).toBeInTheDocument();
    // 2 MB
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });
});
