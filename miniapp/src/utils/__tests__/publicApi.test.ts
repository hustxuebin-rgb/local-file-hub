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

import { listPublicFiles, listPublicFolders } from '../api';

describe('publicApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ====== listPublicFolders ======

  describe('listPublicFolders', () => {
    it('无参数调用应该获取顶层文件夹', async () => {
      mockGet.mockResolvedValue([]);

      await listPublicFolders();

      expect(mockGet).toHaveBeenCalledWith('/api/folder/public', {
        skipErrorToast: true,
        params: undefined,
      });
    });

    it('传入 parentId 应该传递参数', async () => {
      mockGet.mockResolvedValue([]);

      await listPublicFolders(5);

      expect(mockGet).toHaveBeenCalledWith('/api/folder/public', {
        skipErrorToast: true,
        params: { parentId: 5 },
      });
    });

    it('应该正确返回文件夹列表', async () => {
      const mockFolders = [
        { id: 1, folderName: '文档', parentId: 0, fullPath: '/文档', createTime: '2025-01-01' },
        { id: 2, folderName: '图片', parentId: 0, fullPath: '/图片', createTime: '2025-01-02' },
      ];
      mockGet.mockResolvedValue(mockFolders);

      const result = await listPublicFolders();

      expect(result).toEqual(mockFolders);
      expect(result).toHaveLength(2);
      expect(result[0].folderName).toBe('文档');
    });

    it('网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(listPublicFolders()).rejects.toThrow('Network error');
    });
  });

  // ====== listPublicFiles ======

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

    it('传入 folderId 参数应该传递给 API', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await listPublicFiles({ folderId: 10, page: 1, pageSize: 20 });

      expect(mockGet).toHaveBeenCalledWith('/api/file/public', {
        params: { folderId: 10, page: 1, pageSize: 20 },
        skipErrorToast: true,
      });
    });
  });

  describe('异常路径', () => {
    it('listPublicFiles 网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(listPublicFiles({ page: 1, pageSize: 20 })).rejects.toThrow('Network error');
    });

    it('listPublicFolders 网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(listPublicFolders()).rejects.toThrow('Network error');
    });
  });
});
