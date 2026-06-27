import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FavoritesPage from '../FavoritesPage';

// Mock stores
const mockFetchFavorites = vi.fn();
vi.mock('@/stores/useFavoriteStore', () => ({
  useFavoriteStore: vi.fn(() => ({
    favorites: [],
    total: 0,
    loading: false,
    fetchFavorites: mockFetchFavorites,
  })),
}));

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: vi.fn(() => ({
    viewMode: 'list',
    setViewMode: vi.fn(),
    toggleView: vi.fn(),
  })),
}));

// Mock API
vi.mock('@/api', () => ({
  removeFavorite: vi.fn().mockResolvedValue({ code: 200 }),
}));

// Mock errorCodes
vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn(() => '操作失败'),
}));

describe('FavoritesPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染页面标题"我的收藏"', async () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('我的收藏', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('空收藏列表渲染 FileViewToggle', async () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('列表', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('图标')).toBeInTheDocument();
  });

  it('mount 时调用 fetchFavorites', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(mockFetchFavorites).toHaveBeenCalledWith(1, 20);
  });
});
