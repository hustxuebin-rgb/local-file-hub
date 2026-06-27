// Mock request 模块，避免触发 config → @tarojs/taro 链
const mockGet = jest.fn();

jest.mock('../request', () => ({
  __esModule: true,
  default: {
    get: mockGet,
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { listPublicFiles } from '../api';

describe('publicApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPublicFiles', () => {
    it('基本调用应该传递分页参数和 skipErrorToast', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await listPublicFiles({ page: 1, pageSize: 20 });

      expect(mockGet).toHaveBeenCalledWith('/api/file/public', {
        params: { page: 1, pageSize: 20 },
        skipErrorToast: true,
      });
    });

    it('带全部过滤参数时应该全部传递', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await listPublicFiles({
        keyword: 'test',
        fileType: '1',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        pageSize: 20,
      });

      expect(mockGet).toHaveBeenCalledWith('/api/file/public', {
        params: {
          keyword: 'test',
          fileType: '1',
          sortBy: 'name',
          sortOrder: 'asc',
          page: 1,
          pageSize: 20,
        },
        skipErrorToast: true,
      });
    });

    it('不传参数时应该正常调用', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await listPublicFiles();

      expect(mockGet).toHaveBeenCalledWith('/api/file/public', {
        skipErrorToast: true,
        params: undefined,
      });
    });

    it('应该正确返回分页响应结构', async () => {
      const mockData = {
        total: 5,
        list: [
          { id: 1, fileName: 'test.pdf', fileSize: 1024, fileType: 1, fileSuffix: 'pdf', mimeType: 'application/pdf', folderId: 0, uploaderName: '张三', createTime: '2025-01-01', fullPath: '/test.pdf' },
        ],
      };
      mockGet.mockResolvedValue(mockData);

      const result = await listPublicFiles({ page: 1, pageSize: 20 });

      expect(result).toEqual(mockData);
      expect(result.total).toBe(5);
      expect(result.list).toHaveLength(1);
    });
  });

  describe('异常路径', () => {
    it('网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(listPublicFiles({ page: 1, pageSize: 20 })).rejects.toThrow('Network error');
    });
  });
});
