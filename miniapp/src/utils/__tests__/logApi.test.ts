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

import { getMyLogs } from '../api';

describe('logApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyLogs', () => {
    it('不带过滤参数时应该只传分页参数', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await getMyLogs({ page: 1, pageSize: 20 });

      expect(mockGet).toHaveBeenCalledWith('/api/log/my', {
        skipErrorToast: true,
        params: { page: 1, pageSize: 20 },
      });
    });

    it('带 operType 过滤时应该包含过滤参数', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await getMyLogs({ operType: 6, page: 1, pageSize: 20 });

      expect(mockGet).toHaveBeenCalledWith('/api/log/my', {
        skipErrorToast: true,
        params: { operType: 6, page: 1, pageSize: 20 },
      });
    });

    it('不传参数时应该正常调用', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await getMyLogs();

      expect(mockGet).toHaveBeenCalledWith('/api/log/my', {
        skipErrorToast: true,
        params: undefined,
      });
    });
  });

  describe('异常路径', () => {
    it('网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(getMyLogs({ page: 1, pageSize: 20 })).rejects.toThrow('Network error');
    });
  });
});
