import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDownload } from '../useDownload';

// Mock API
const mockDownloadInit = vi.fn();
vi.mock('@/api/file', () => ({
  downloadInit: (...args: unknown[]) => mockDownloadInit(...args),
}));

// Mock errorCodes
vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn((code?: number, fallback?: string) => fallback ?? `Error: ${code}`),
}));

// Mock authStore
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ token: 'mock-token-abc' }),
  },
}));

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('useDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始状态应为 null', () => {
    const { result } = renderHook(() => useDownload());
    expect(result.current.downloadState).toBeNull();
  });

  it('startDownload 应初始化下载状态', async () => {
    mockDownloadInit.mockResolvedValue({
      data: {
        taskId: 'dl-001',
        fileName: 'test.bin',
        totalSize: 102400,
      },
    });

    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.startDownload(1);
    });

    await waitFor(() => {
      expect(result.current.downloadState).not.toBeNull();
    });

    expect(result.current.downloadState?.taskId).toBe('dl-001');
    expect(result.current.downloadState?.fileName).toBe('test.bin');
    expect(result.current.downloadState?.totalSize).toBe(102400);
    expect(mockDownloadInit).toHaveBeenCalledWith(1);
  });

  it('downloadInit 失败时应保持状态为 null', async () => {
    mockDownloadInit.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.startDownload(1);
    });

    // 由于 fetch 内部错误被捕获，downloadState 应为 null
    expect(result.current.downloadState).toBeNull();
  });

  it('pauseDownload 应更新状态为 paused', async () => {
    mockDownloadInit.mockResolvedValue({
      data: {
        taskId: 'dl-002',
        fileName: 'report.pdf',
        totalSize: 5242880,
      },
    });

    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.startDownload(2);
    });

    await waitFor(() => {
      expect(result.current.downloadState).not.toBeNull();
    });

    act(() => {
      result.current.pauseDownload();
    });

    await waitFor(() => {
      expect(result.current.downloadState?.status).toBe('paused');
    });
  });

  it('cancelDownload 应将状态重置为 null', async () => {
    mockDownloadInit.mockResolvedValue({
      data: {
        taskId: 'dl-003',
        fileName: 'data.zip',
        totalSize: 1048576,
      },
    });

    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.startDownload(3);
    });

    await waitFor(() => {
      expect(result.current.downloadState).not.toBeNull();
    });

    act(() => {
      result.current.cancelDownload();
    });

    expect(result.current.downloadState).toBeNull();
  });
});
