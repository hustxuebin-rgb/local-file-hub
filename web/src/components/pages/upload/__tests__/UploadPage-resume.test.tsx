import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockGetUnfinishedUploads = vi.fn();
const mockGetTree = vi.fn();

vi.mock('@/api', () => ({
  uploadInit: vi.fn().mockResolvedValue({ data: { quickDone: false, taskId: 'task-001', chunkSize: 5242880, totalChunks: 10 } }),
  uploadChunk: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadMerge: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadCancel: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadPause: vi.fn().mockResolvedValue({ data: { code: 200 } }),
  uploadResume: vi.fn().mockResolvedValue({ data: { finishedChunks: [0, 1, 2], finishedCount: 3 } }),
  getUnfinishedUploads: (...args: unknown[]) => mockGetUnfinishedUploads(...args),
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
    mockGetUnfinishedUploads.mockResolvedValue({ data: [] });
  });

  it('页面加载时应调用 getUnfinishedUploads 恢复未完成任务', async () => {
    render(<UploadPage />);

    await waitFor(() => {
      expect(mockGetUnfinishedUploads).toHaveBeenCalled();
    });
  });

  it('有未完成任务时应渲染恢复的任务列表', async () => {
    mockGetUnfinishedUploads.mockResolvedValue({
      data: [
        {
          id: 1,
          userId: 1,
          taskId: 'task-recover-001',
          fileName: 'recover-me.zip',
          totalSize: 104857600,
          chunkSize: 5242880,
          totalChunk: 20,
          finishedChunk: 10,
          folderId: 1,
          visibility: 0,
          status: 5,
          createTime: '2026-06-28T00:00:00Z',
        },
      ],
    });

    render(<UploadPage />);

    await waitFor(() => {
      expect(screen.getByText('recover-me.zip')).toBeInTheDocument();
    });

    // 恢复的任务应显示"已暂停"状态
    await waitFor(() => {
      expect(screen.getByText('已暂停')).toBeInTheDocument();
    });

    // 进度应为 50%（10/20）
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('恢复的任务在无 file 引用时应显示启用状态（点击弹出断点续传确认框）', async () => {
    mockGetUnfinishedUploads.mockResolvedValue({
      data: [
        {
          id: 1,
          userId: 1,
          taskId: 'task-old-001',
          fileName: 'old-file.bin',
          totalSize: 52428800,
          chunkSize: 5242880,
          totalChunk: 10,
          finishedChunk: 5,
          folderId: 1,
          visibility: 0,
          status: 5,
          createTime: '2026-06-28T00:00:00Z',
        },
      ],
    });

    render(<UploadPage />);

    await waitFor(() => {
      expect(screen.getByText('old-file.bin')).toBeInTheDocument();
    });

    // 恢复按钮应为启用状态（无 file 时弹出 Modal.confirm 引导重新选择文件）
    const playButton = screen.getByTestId('play-icon').closest('button');
    expect(playButton).not.toBeDisabled();
  });
});
