import { create } from 'zustand';
import { listFavorites, addFavorite as addFavoriteApi, removeFavorite as removeFavoriteApi } from '@/api';
import type { Favorite } from '@/types';

interface FavoriteState {
  favorites: Favorite[];
  total: number;
  loading: boolean;
  favoritedIds: Set<number>;

  fetchFavorites: (page?: number, pageSize?: number, keyword?: string, targetType?: number, sortBy?: string, sortOrder?: string) => Promise<void>;
  addFavorite: (targetType: number, targetId: number) => Promise<void>;
  removeFavorite: (targetType: number, targetId: number) => Promise<void>;
  isFavorited: (targetId: number) => boolean;
  toggleFavorite: (targetType: number, targetId: number) => Promise<void>;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: [],
  total: 0,
  loading: false,
  favoritedIds: new Set<number>(),

  fetchFavorites: async (page = 1, pageSize = 20, keyword, targetType, sortBy, sortOrder) => {
    set({ loading: true });
    try {
      const res = await listFavorites({ page, pageSize, keyword, targetType, sortBy, sortOrder });
      if (res.data) {
        set((state) => {
          const newIds = new Set(state.favoritedIds);
          res.data!.list.forEach((f) => newIds.add(f.targetId));
          return { favorites: res.data!.list, total: res.data!.total, favoritedIds: newIds };
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  addFavorite: async (targetType: number, targetId: number) => {
    await addFavoriteApi({ targetType, targetId });
    get().fetchFavorites();
  },

  removeFavorite: async (targetType: number, targetId: number) => {
    await removeFavoriteApi({ targetType, targetId });
    get().fetchFavorites();
  },

  isFavorited: (targetId: number) => {
    return get().favoritedIds.has(targetId);
  },

  toggleFavorite: async (targetType: number, targetId: number) => {
    const { favoritedIds } = get();
    if (favoritedIds.has(targetId)) {
      await removeFavoriteApi({ targetType, targetId });
      set((state) => ({
        favoritedIds: new Set([...state.favoritedIds].filter((id) => id !== targetId)),
      }));
    } else {
      await addFavoriteApi({ targetType, targetId });
      set((state) => ({
        favoritedIds: new Set([...state.favoritedIds, targetId]),
      }));
    }
  },
}));
