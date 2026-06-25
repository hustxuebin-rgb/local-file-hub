import Taro from '@tarojs/taro';
import { STORAGE_KEYS } from '../config';

// Mock Taro
jest.mock('@tarojs/taro', () => ({
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  reLaunch: jest.fn(),
  showToast: jest.fn(),
  NetworkError: class NetworkError extends Error {
    constructor() {
      super('Network Error');
    }
  },
  request: jest.fn(),
}));

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    it('initAuth 时没有 token 应该保持未登录状态', () => {
      (Taro.getStorageSync as jest.Mock).mockReturnValue('');
      const useAuthStore = require('../../stores/authStore').default;
      const store = useAuthStore.getState();
      expect(store.isLoggedIn).toBe(false);
    });

    it('initAuth 时有 token 应该设置登录状态', () => {
      (Taro.getStorageSync as jest.Mock).mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.TOKEN) return 'test-token';
        if (key === STORAGE_KEYS.USER_INFO) return JSON.stringify({ id: 1, username: 'test', nickname: 'Test', role: 1, storageQuota: 0, storageUsed: 0 });
        return '';
      });
      const useAuthStore = require('../../stores/authStore').default;
      useAuthStore.getState().initAuth();
      const store = useAuthStore.getState();
      expect(store.isLoggedIn).toBe(true);
      expect(store.token).toBe('test-token');
    });
  });

  describe('登录/登出', () => {
    it('login 应该保存 token 和 user 到 storage', () => {
      (Taro.setStorageSync as jest.Mock).mockImplementation(() => {});
      const useAuthStore = require('../../stores/authStore').default;
      const testUser = { id: 1, username: 'test', nickname: 'Test', role: 1, storageQuota: 1073741824, storageUsed: 1048576 };
      
      useAuthStore.getState().login('test-token', testUser);
      
      expect(Taro.setStorageSync).toHaveBeenCalledWith(STORAGE_KEYS.TOKEN, 'test-token');
      expect(Taro.setStorageSync).toHaveBeenCalledWith(STORAGE_KEYS.USER_INFO, JSON.stringify(testUser));
      
      const store = useAuthStore.getState();
      expect(store.isLoggedIn).toBe(true);
      expect(store.token).toBe('test-token');
      expect(store.user).toEqual(testUser);
    });

    it('logout 应该清除 storage 并重置状态', () => {
      (Taro.removeStorageSync as jest.Mock).mockImplementation(() => {});
      const useAuthStore = require('../../stores/authStore').default;
      
      useAuthStore.getState().logout();
      
      expect(Taro.removeStorageSync).toHaveBeenCalledWith(STORAGE_KEYS.TOKEN);
      expect(Taro.removeStorageSync).toHaveBeenCalledWith(STORAGE_KEYS.USER_INFO);
      
      const store = useAuthStore.getState();
      expect(store.isLoggedIn).toBe(false);
      expect(store.token).toBe('');
      expect(store.user).toBeNull();
    });
  });
});
