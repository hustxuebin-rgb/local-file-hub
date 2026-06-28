import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uploadStatus,
  uploadPause,
  uploadResume,
  getUnfinishedUploads,
  downloadInit,
} from '../file';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('断点续传 API 函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadStatus', () => {
    it('应正确调用 GET 并携带 taskId 参数', async () => {
      const mockResp = {
        data: {
          code: 200,
          data: {
            taskId: 'task-001',
            fileName: 'test.mp4',
            totalSize: 1073741824,
            chunkSize: 5242880,
            totalChunks: 205,
            finishedChunks: [0, 1, 2],
            finishedCount: 3,
            status: 1,
            progress: 1.46,
          },
        },
      };
      mockGet.mockResolvedValue(mockResp);

      const result = await uploadStatus('task-001');

      expect(mockGet).toHaveBeenCalledWith('/api/file/upload/status', {
        params: { taskId: 'task-001' },
      });
      expect(result.data?.taskId).toBe('task-001');
      expect(result.data?.finishedChunks).toEqual([0, 1, 2]);
    });
  });

  describe('uploadPause', () => {
    it('应正确调用 POST 并传入 taskId', async () => {
      mockPost.mockResolvedValue({ data: { code: 200 } });

      const result = await uploadPause('task-001');

      expect(mockPost).toHaveBeenCalledWith('/api/file/upload/pause', {
        taskId: 'task-001',
      });
      expect(result.code).toBe(200);
    });
  });

  describe('uploadResume', () => {
    it('应正确调用 POST 并解析返回的 finishedChunks', async () => {
      const mockResp = {
        data: {
          code: 200,
          data: {
            taskId: 'task-001',
            fileName: 'test.mp4',
            totalSize: 1073741824,
            chunkSize: 5242880,
            totalChunks: 205,
            finishedChunks: [0, 1, 2, 3, 4],
            finishedCount: 5,
          },
        },
      };
      mockPost.mockResolvedValue(mockResp);

      const result = await uploadResume('task-001');

      expect(mockPost).toHaveBeenCalledWith('/api/file/upload/resume', {
        taskId: 'task-001',
      });
      expect(result.data?.finishedChunks).toHaveLength(5);
      expect(result.data?.finishedCount).toBe(5);
    });
  });

  describe('getUnfinishedUploads', () => {
    it('应正确调用 GET 并解析返回的任务列表', async () => {
      const mockResp = {
        data: {
          code: 200,
          data: [
            {
              id: 1,
              userId: 1,
              taskId: 'task-001',
              fileName: 'video.mp4',
              totalSize: 524288000,
              chunkSize: 5242880,
              totalChunk: 100,
              finishedChunk: 42,
              folderId: 5,
              visibility: 0,
              status: 5,
              createTime: '2026-06-28T10:00:00Z',
            },
          ],
        },
      };
      mockGet.mockResolvedValue(mockResp);

      const result = await getUnfinishedUploads();

      expect(mockGet).toHaveBeenCalledWith('/api/file/upload/unfinished');
      expect(result.data).toHaveLength(1);
      expect(result.data![0].status).toBe(5); // paused
      expect(result.data![0].finishedChunk).toBe(42);
    });
  });

  describe('downloadInit', () => {
    it('应正确调用 POST 并返回下载初始化信息', async () => {
      const mockResp = {
        data: {
          code: 200,
          data: {
            taskId: 'dl-001',
            fileName: 'report.pdf',
            totalSize: 104857600,
            contentType: 'application/pdf',
          },
        },
      };
      mockPost.mockResolvedValue(mockResp);

      const result = await downloadInit(123);

      expect(mockPost).toHaveBeenCalledWith('/api/file/download/init', {
        fileId: 123,
      });
      expect(result.data?.taskId).toBe('dl-001');
      expect(result.data?.totalSize).toBe(104857600);
    });
  });
});
