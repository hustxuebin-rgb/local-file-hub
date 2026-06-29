import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FavoritesPage from '../FavoritesPage';

// Mock stores
const mockFetchFavorites = vi.fn();
vi.mock('@/stores/useFavoriteStore', () => ({
  useFavoriteStore: vi.fn(() => ({
    favorites: [],
    total: 0,
    loading: false,
    favoritedIds: new Set<number>(),
    fetchFavorites: mockFetchFavorites,
    isFavorited: () => false,
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/api/file', () => ({
  previewFile: vi.fn().mockResolvedValue(new Blob()),
}));

// Mock errorCodes
vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn(() => '操作失败'),
}));

// Mock preview
vi.mock('@/utils/preview', () => ({
  isPreviewable: vi.fn(() => true),
}));

describe('FavoritesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFavorites.mockClear();
  });

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

  it('渲染搜索栏', async () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    // FileSearchBar renders an Input.Search with placeholder "搜索收藏"
    expect(await screen.findByPlaceholderText('搜索收藏', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('渲染分类标签（全部/文件/文件夹/分享）', async () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('全部', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('文件')).toBeInTheDocument();
    expect(screen.getByText('文件夹')).toBeInTheDocument();
    expect(screen.getByText('分享')).toBeInTheDocument();
  });

  it('渲染 FileViewToggle（列表/图标）', async () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('列表', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('图标')).toBeInTheDocument();
  });

  it('mount 时调用 fetchFavorites 并传递默认参数', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    );
    expect(mockFetchFavorites).toHaveBeenCalledWith(1, 20, undefined, undefined);
  });
});
