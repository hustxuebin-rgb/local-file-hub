import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { useFavoriteStore } from '../useFavoriteStore';

// Mock API 模块 — store 实际从 @/api 导入
vi.mock('@/api', () => ({
  listFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

describe('useFavoriteStore', () => {
  beforeEach(() => {
    act(() => {
      useFavoriteStore.setState({ favorites: [], total: 0, loading: false });
    });
  });

  it('初始状态正确', () => {
    const state = useFavoriteStore.getState();
    expect(state.favorites).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.loading).toBe(false);
  });

  it('fetchFavorites 更新状态', async () => {
    const mockData = {
      total: 1,
      list: [
        {
          id: 1,
          targetType: 1,
          targetId: 1,
          targetName: 'test.png',
          targetSize: 1024,
          ownerName: 'user',
          createTime: '2026-01-01',
        },
      ],
    };
    const { listFavorites } = await import('@/api');
    vi.mocked(listFavorites).mockResolvedValue({ data: mockData } as never);

    await act(async () => {
      await useFavoriteStore.getState().fetchFavorites(1, 20);
    });

    const state = useFavoriteStore.getState();
    expect(state.favorites).toHaveLength(1);
    expect(state.total).toBe(1);
    expect(state.loading).toBe(false);
  });
});
