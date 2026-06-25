import Taro from '@tarojs/taro';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../utils/config';

interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  role: number;
  storageQuota: number;
  storageUsed: number;
}

interface AuthState {
  token: string;
  user: UserInfo | null;
  isLoggedIn: boolean;
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  setUser: (user: UserInfo) => void;
  initAuth: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  token: '',
  user: null,
  isLoggedIn: false,

  login: (token: string, user: UserInfo) => {
    Taro.setStorageSync(STORAGE_KEYS.TOKEN, token);
    Taro.setStorageSync(STORAGE_KEYS.USER_INFO, JSON.stringify(user));
    set({ token, user, isLoggedIn: true });
  },

  logout: () => {
    Taro.removeStorageSync(STORAGE_KEYS.TOKEN);
    Taro.removeStorageSync(STORAGE_KEYS.USER_INFO);
    set({ token: '', user: null, isLoggedIn: false });
  },

  setUser: (user: UserInfo) => {
    Taro.setStorageSync(STORAGE_KEYS.USER_INFO, JSON.stringify(user));
    set({ user });
  },

  initAuth: () => {
    const token = Taro.getStorageSync(STORAGE_KEYS.TOKEN);
    const userStr = Taro.getStorageSync(STORAGE_KEYS.USER_INFO);
    if (token) {
      let user: UserInfo | null = null;
      try {
        user = JSON.parse(userStr || '{}');
      } catch {
        user = null;
      }
      set({ token, user, isLoggedIn: !!token });
    }
  },
}));

export default useAuthStore;
