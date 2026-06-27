import { create } from 'zustand';
import { listFavorites, addFavorite as addFavoriteApi, removeFavorite as removeFavoriteApi } from '@/api';
import type { Favorite } from '@/types';

interface FavoriteState {
  favorites: Favorite[];
  total: number;
  loading: boolean;

  fetchFavorites: (page?: number, pageSize?: number, keyword?: string, targetType?: number, sortBy?: string, sortOrder?: string) => Promise<void>;
  addFavorite: (targetType: number, targetId: number) => Promise<void>;
  removeFavorite: (targetType: number, targetId: number) => Promise<void>;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: [],
  total: 0,
  loading: false,

  fetchFavorites: async (page = 1, pageSize = 20, keyword, targetType, sortBy, sortOrder) => {
    set({ loading: true });
    try {
      const res = await listFavorites({ page, pageSize, keyword, targetType, sortBy, sortOrder });
      if (res.data) {
        set({ favorites: res.data.list, total: res.data.total });
      }
    } finally {
      set({ loading: false });
    }
  },

  addFavorite: async (targetType: number, targetId: number) => {
    await addFavoriteApi({ targetType, targetId });
    // 重新拉取列表
    get().fetchFavorites();
  },

  removeFavorite: async (targetType: number, targetId: number) => {
    await removeFavoriteApi({ targetType, targetId });
    // 重新拉取列表
    get().fetchFavorites();
  },
}));
