import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  /** 访问 Token */
  token: string;
  /** 当前用户信息 */
  user: User | null;
  /** 登录成功，保存 token 和 user */
  login: (token: string, user: User) => void;
  /** 登出，清除所有认证信息 */
  logout: () => void;
  /** 更新用户信息 */
  setUser: (user: User) => void;
  /** 是否已登录（token 存在） */
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      user: null,

      login: (token: string, user: User) => {
        set({ token, user });
      },

      logout: () => {
        set({ token: '', user: null });
      },

      setUser: (user: User) => {
        set({ user });
      },

      isLoggedIn: () => {
        return !!get().token;
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);
