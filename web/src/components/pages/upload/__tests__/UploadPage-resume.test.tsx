import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UploadPage from '../UploadPage';

// Mock Ant Design icons
vi.mock('@ant-design/icons', async () => {
  const actual = await vi.importActual('@ant-design/icons');
  return {
    ...actual,
    PauseCircleOutlined: () => <span data-testid="pause-icon">⏸</span>,
    PlayCircleOutlined: () => <span data-testid="play-icon">▶</span>,
  };
});

// Mock API
const mockGetTree = vi.fn();

vi.mock('@/api', () => ({
  uploadInit: vi.fn().mockResolvedValue({ data: { quickDone: false, taskId: 'task-001', chunkSize: 5242880, totalChunks: 10 } }),
  uploadChunk: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadMerge: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadCancel: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadPause: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadResume: vi.fn().mockResolvedValue({ data: { finishedChunks: [0, 1, 2], finishedCount: 3 } }),
  getTree: (...args: unknown[]) => mockGetTree(...args),
  createFolder: vi.fn().mockResolvedValue({ data: {} }),
  batchCreateFolders: vi.fn().mockResolvedValue({ data: { folders: [] } }),
}));

vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn((code?: number, fallback?: string) => fallback ?? `Error: ${code}`),
}));

describe('UploadPage — 断点续传与暂停恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTree.mockResolvedValue({ data: [] });
  });

  it('页面加载时不再调用 getUnfinishedUploads（旧任务恢复已迁移至 TaskCenterPage）', async () => {
    render(<UploadPage />);

    await waitFor(() => {
      // 页面应正常渲染（不挂载旧任务）
      expect(screen.getByText('上传文件')).toBeInTheDocument();
    });
  });

  it('无上传任务时不应显示表格', async () => {
    render(<UploadPage />);

    await waitFor(() => {
      expect(screen.getByText('上传文件')).toBeInTheDocument();
    });

    // sessionTasks 初始为空，表格不应渲染
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
