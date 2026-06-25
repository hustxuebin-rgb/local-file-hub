// Mock request 模块，避免触发 config → @tarojs/taro 链
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../request', () => ({
  __esModule: true,
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

import { getServerInfo, ServerInfo } from '../api';

describe('getServerInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('正常路径', () => {
    it('应该调用 /api/lan/server_info 并返回完整信息', async () => {
      mockGet.mockResolvedValue({ device_name: 'MyMac', local_ip: '192.168.1.100' });

      const result = await getServerInfo();

      expect(mockGet).toHaveBeenCalledWith('/api/lan/server_info', { skipErrorToast: true });
      expect(result).toEqual({ device_name: 'MyMac', local_ip: '192.168.1.100' });
    });

    it('应该能处理仅有 device_name 的响应', async () => {
      mockGet.mockResolvedValue({ device_name: 'MyMac' });

      const result = await getServerInfo();

      expect(result).toEqual({ device_name: 'MyMac' });
    });

    it('应该能处理仅有 local_ip 的响应', async () => {
      mockGet.mockResolvedValue({ local_ip: '10.0.0.5' });

      const result = await getServerInfo();

      expect(result).toEqual({ local_ip: '10.0.0.5' });
    });
  });

  describe('边界条件', () => {
    it('应该能处理空的响应数据', async () => {
      mockGet.mockResolvedValue({});

      const result = await getServerInfo();

      expect(result).toEqual({});
    });
  });

  describe('异常路径', () => {
    it('网络请求失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(getServerInfo()).rejects.toThrow('Network error');
    });
  });

  describe('类型导出', () => {
    it('ServerInfo 接口应该可被导入', () => {
      const info: ServerInfo = { device_name: 'test', local_ip: '127.0.0.1' };
      expect(info.device_name).toBe('test');
      expect(info.local_ip).toBe('127.0.0.1');
    });
  });
});
