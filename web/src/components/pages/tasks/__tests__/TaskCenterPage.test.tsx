import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TaskCenterPage from '../TaskCenterPage';

// Mock API
vi.mock('@/api/file', () => ({
  tasksList: vi.fn().mockResolvedValue({
    data: [
      {
        taskId: 'task-1',
        taskType: 'upload',
        fileName: 'photo.jpg',
        totalSize: 5242880,
        finishedSize: 2621440,
        totalChunk: 10,
        finishedChunk: 5,
        status: 1,
        progress: 50,
        createTime: '2025-06-28T10:00:00Z',
      },
      {
        taskId: 'task-2',
        taskType: 'download',
        fileName: 'archive.zip',
        totalSize: 10485760,
        finishedSize: 0,
        totalChunk: 20,
        finishedChunk: 0,
        status: 0,
        progress: 0,
        createTime: '2025-06-28T10:05:00Z',
      },
    ],
  }),
  tasksStats: vi.fn().mockResolvedValue({
    data: {
      upload: { count: 10, totalSize: 1073741824, avgSpeed: 2097152 },
      download: { count: 3, totalSize: 524288000, avgSpeed: 1048576 },
    },
  }),
  tasksBatch: vi.fn().mockResolvedValue({ code: 200, msg: 'ok' }),
}));

vi.mock('@/stores/useTaskStore', () => {
  const actual = vi.importActual('@/stores/useTaskStore');
  return {
    useTaskStore: vi.fn((selector?: (state: unknown) => unknown) => {
      const state = {
        taskStats: null,
        setTaskStats: vi.fn(),
        selectedTaskIds: [],
        setSelectedTaskIds: vi.fn(),
        toggleSelectTask: vi.fn(),
        selectAllTasks: vi.fn(),
        clearSelection: vi.fn(),
      };
      return selector ? selector(state) : state;
    }),
  };
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <TaskCenterPage />
    </MemoryRouter>,
  );
}

describe('TaskCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page title', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('任务中心')).toBeInTheDocument();
    });
  });

  it('should render stats cards', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('今日上传')).toBeInTheDocument();
      expect(screen.getByText('今日下载')).toBeInTheDocument();
    });
  });

  it('should render tabs: upload, download, history', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText(/上传中/)).toBeInTheDocument();
      expect(screen.getByText(/下载中/)).toBeInTheDocument();
      expect(screen.getByText('历史记录')).toBeInTheDocument();
    });
  });

  it('should render upload tasks in active tab', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    });
  });
});
