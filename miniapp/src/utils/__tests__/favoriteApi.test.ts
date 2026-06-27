// Mock request 模块，避免触发 config → @tarojs/taro 链
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('../request', () => ({
  __esModule: true,
  default: {
    get: mockGet,
    post: mockPost,
    put: jest.fn(),
    delete: mockDelete,
  },
}));

import { addFavorite, removeFavorite, listFavorites } from '../api';

describe('favoriteApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addFavorite', () => {
    it('应该调用 POST /api/favorite 并传递 targetType 和 targetId', async () => {
      mockPost.mockResolvedValue(undefined);

      await addFavorite({ targetType: 1, targetId: 123 });

      expect(mockPost).toHaveBeenCalledWith('/api/favorite', { targetType: 1, targetId: 123 });
    });
  });

  describe('removeFavorite', () => {
    it('应该调用 DELETE /api/favorite 并通过 body 传递 targetType 和 targetId', async () => {
      mockDelete.mockResolvedValue(undefined);

      await removeFavorite({ targetType: 1, targetId: 123 });

      expect(mockDelete).toHaveBeenCalledWith('/api/favorite', { targetType: 1, targetId: 123 });
    });
  });

  describe('listFavorites', () => {
    it('应该调用 GET /api/favorite/list 并传递分页参数', async () => {
      mockGet.mockResolvedValue({ total: 2, list: [] });

      await listFavorites({ page: 1, pageSize: 20 });

      expect(mockGet).toHaveBeenCalledWith('/api/favorite/list', {
        skipErrorToast: true,
        params: { page: 1, pageSize: 20 },
      });
    });

    it('不传参数时应该正常调用', async () => {
      mockGet.mockResolvedValue({ total: 0, list: [] });

      await listFavorites();

      expect(mockGet).toHaveBeenCalledWith('/api/favorite/list', {
        skipErrorToast: true,
        params: undefined,
      });
    });
  });

  describe('异常路径', () => {
    it('addFavorite 网络失败时应该抛出错误', async () => {
      mockPost.mockRejectedValue(new Error('Network error'));

      await expect(addFavorite({ targetType: 1, targetId: 123 })).rejects.toThrow('Network error');
    });

    it('listFavorites 网络失败时应该抛出错误', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(listFavorites({ page: 1, pageSize: 20 })).rejects.toThrow('Network error');
    });
  });
});
