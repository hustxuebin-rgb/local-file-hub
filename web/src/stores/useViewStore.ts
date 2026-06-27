import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode } from '@/types';

interface ViewState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleView: () => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      viewMode: 'list',

      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode });
      },

      toggleView: () => {
        const { viewMode } = get();
        set({ viewMode: viewMode === 'list' ? 'grid' : 'list' });
      },
    }),
    {
      name: 'view-storage',
    },
  ),
);
