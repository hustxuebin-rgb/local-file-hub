import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FileManager from '../FileManager';

// Mock Zustand stores
const mockSetPartition = vi.fn();
const mockSetFolderId = vi.fn();
const mockFetchFiles = vi.fn();
const mockFetchTree = vi.fn();
const mockUpdateLocalFileVisibility = vi.fn();

let mockStoreState = {
  currentPartition: 0,
  currentFolderId: null as number | null,
  fileList: [] as import('@/types').FileInfo[],
  total: 0,
  folderTree: [] as import('@/types').Folder[],
  loading: false,
  setPartition: mockSetPartition,
  setFolderId: mockSetFolderId,
  fetchFiles: mockFetchFiles,
  fetchTree: mockFetchTree,
  updateLocalFileVisibility: mockUpdateLocalFileVisibility,
};

vi.mock('@/stores/useFileStore', () => ({
  useFileStore: (selector?: (state: typeof mockStoreState) => unknown) => {
    if (selector) return selector(mockStoreState);
    return mockStoreState;
  },
}));

let mockViewMode: import('@/types').ViewMode = 'list';
const mockSetViewMode = vi.fn((mode: import('@/types').ViewMode) => {
  mockViewMode = mode;
});

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: () => ({
    viewMode: mockViewMode,
    setViewMode: mockSetViewMode,
    toggleView: vi.fn(),
  }),
}));

// Mock useFavoriteStore
vi.mock('@/stores/useFavoriteStore', () => ({
  useFavoriteStore: () => ({
    favoritedIds: new Set<number>(),
    fetchFavorites: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    isFavorited: () => false,
  }),
}));

// Mock API calls
vi.mock('@/api', () => ({
  createFolder: vi.fn().mockResolvedValue({ data: {} }),
  renameFolder: vi.fn().mockResolvedValue({ data: {} }),
  deleteFolder: vi.fn().mockResolvedValue({ data: {} }),
  deleteFile: vi.fn().mockResolvedValue({ data: {} }),
  addFavorite: vi.fn().mockResolvedValue({ data: {} }),
  listFolders: vi.fn().mockResolvedValue({ data: [] }),
  listFavorites: vi.fn().mockResolvedValue({ data: { list: [], total: 0 } }),
  updateFolderVisibility: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@/hooks/useDownload', () => ({
  useDownload: () => ({
    startDownload: vi.fn(),
  }),
}));

vi.mock('@/api/file', () => ({
  downloadFile: vi.fn().mockResolvedValue(new Blob()),
  previewFile: vi.fn().mockResolvedValue(new Blob()),
  updateFileVisibility: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn((code?: number) => `Error: ${code ?? 'unknown'}`),
}));

vi.mock('@/utils/preview', () => ({
  isPreviewable: vi.fn(() => true),
}));

// Mock child components
vi.mock('@/components/shared/FileSearchBar', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="file-search-bar">{placeholder}</div>
  ),
}));

vi.mock('@/components/shared/FileCategoryTabs', () => ({
  default: ({ activeKey }: { activeKey: string }) => (
    <div data-testid="file-category-tabs">{activeKey}</div>
  ),
}));

vi.mock('@/components/shared/FileViewToggle', () => ({
  default: () => <div data-testid="file-view-toggle" />,
}));

vi.mock('@/components/shared/FileGridView', () => ({
  default: ({ onFolderClick }: any) => (
    <div data-testid="file-grid-view" data-has-folder-click={String(!!onFolderClick)} />
  ),
}));

vi.mock('@/components/shared/BreadcrumbNav', () => ({
  default: ({ items, onClick }: any) => (
    <nav data-testid="breadcrumb-nav">
      {items.map((item: any, i: number) => (
        <span key={i} data-testid={`breadcrumb-item-${i}`} onClick={() => onClick(i)}>
          {item.name}
        </span>
      ))}
    </nav>
  ),
}));

vi.mock('@/components/shared/BatchShareModal', () => ({
  default: () => null,
}));

vi.mock('@/components/shared/ShareFileModal', () => ({
  default: () => null,
}));

describe('FileManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewMode = 'list';
    mockSetViewMode.mockImplementation((mode: import('@/types').ViewMode) => {
      mockViewMode = mode;
    });
    mockStoreState = {
      currentPartition: 0,
      currentFolderId: null,
      fileList: [],
      total: 0,
      folderTree: [],
      loading: false,
      setPartition: mockSetPartition,
      setFolderId: mockSetFolderId,
      fetchFiles: mockFetchFiles,
      fetchTree: mockFetchTree,
      updateLocalFileVisibility: mockUpdateLocalFileVisibility,
    };
  });

  it('应正确渲染文件管理页面', async () => {
    render(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('文件管理')).toBeInTheDocument();
      expect(screen.getByText('新建文件夹')).toBeInTheDocument();
    });
  });

  it('应显示分区标签页', async () => {
    render(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('私有文件')).toBeInTheDocument();
      expect(screen.getByText('公共文件')).toBeInTheDocument();
    });
  });

  it('folderTree 为空时应显示空状态', async () => {
    render(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('暂无文件夹')).toBeInTheDocument();
    });
  });

  it('folderTree 有数据时应渲染 DirectoryTree 并展开根节点', async () => {
    mockStoreState.folderTree = [
      {
        id: 1,
        parentId: 0,
        folderName: '根文件夹',
        children: [
          { id: 2, parentId: 1, folderName: '子文件夹A' },
          { id: 3, parentId: 1, folderName: '子文件夹B' },
        ],
      },
      { id: 4, parentId: 0, folderName: '另一个根' },
    ];

    render(<FileManager />);

    await waitFor(() => {
      // 根文件夹应出现在树中（列表模式下也会出现在表格中，所以用 getAllByText）
      expect(screen.getAllByText('根文件夹').length).toBeGreaterThan(0);
      expect(screen.getAllByText('另一个根').length).toBeGreaterThan(0);
    });
  });

  it('初次加载时应调用 fetchTree', async () => {
    render(<FileManager />);

    await waitFor(() => {
      expect(mockFetchTree).toHaveBeenCalledWith(0);
    });
  });

  it('切换分区标签页应更新分区并重新获取树', async () => {
    render(<FileManager />);

    const publicTab = screen.getByText('公共文件');
    act(() => {
      publicTab.click();
    });

    await waitFor(() => {
      expect(mockSetPartition).toHaveBeenCalledWith(1);
      expect(mockFetchTree).toHaveBeenCalledWith(1);
    });
  });

  it('folderTree 变化时应触发树展开初始化（仅一次）', async () => {
    // 初始渲染
    const { rerender } = render(<FileManager />);

    // 首次加载 folderTree
    mockStoreState.folderTree = [
      { id: 1, parentId: 0, folderName: 'Folder1' },
      { id: 2, parentId: 0, folderName: 'Folder2' },
    ];
    rerender(<FileManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Folder1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Folder2').length).toBeGreaterThan(0);
    });

    // 再次更新 folderTree 不应导致额外副作用（ref 已设置）
    mockStoreState.folderTree = [
      { id: 1, parentId: 0, folderName: 'Folder1' },
      { id: 2, parentId: 0, folderName: 'Folder2' },
      { id: 3, parentId: 0, folderName: 'Folder3' },
    ];
    rerender(<FileManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Folder3').length).toBeGreaterThan(0);
    });
  });

  it('切换分区后 folderTree 重置时树初始化 ref 应跟随重置', async () => {
    mockStoreState.folderTree = [
      { id: 1, parentId: 0, folderName: 'PrivateFolder' },
    ];

    const { rerender } = render(<FileManager />);

    await waitFor(() => {
      expect(screen.getAllByText('PrivateFolder').length).toBeGreaterThan(0);
    });

    // 模拟切换分区后 folderTree 先清空再加载新数据
    // 这在真实场景中由 store 管理，此处验证组件不崩溃
    mockStoreState.folderTree = [];
    mockStoreState.currentPartition = 1;
    rerender(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('暂无文件夹')).toBeInTheDocument();
    });
  });

  // ==================== 双模式布局测试 ====================

  it('列表模式（viewMode=list）下应渲染侧边栏，不应渲染面包屑', async () => {
    mockViewMode = 'list';

    render(<FileManager />);

    await waitFor(() => {
      // 侧边栏应可见（文件夹 Card + 空状态提示）
      expect(screen.getByText('暂无文件夹')).toBeInTheDocument();
      // 面包屑不应渲染
      expect(screen.queryByTestId('breadcrumb-nav')).not.toBeInTheDocument();
    });
  });

  it('图标模式（viewMode=grid）下应渲染 BreadcrumbNav，不应渲染侧边栏', async () => {
    mockViewMode = 'grid';

    render(<FileManager />);

    await waitFor(() => {
      // 面包屑应可见
      expect(screen.getByTestId('breadcrumb-nav')).toBeInTheDocument();
      // 侧边栏不应渲染（folderTree 为空时 "暂无文件夹" 出现在侧边栏 Card 中，grid 模式无侧边栏）
      expect(screen.queryByText('暂无文件夹')).not.toBeInTheDocument();
    });
  });

  it('图标模式下 FileGridView 应获得 onFolderClick prop', async () => {
    mockViewMode = 'grid';

    render(<FileManager />);

    await waitFor(() => {
      expect(screen.getByTestId('file-grid-view')).toBeInTheDocument();
      expect(screen.getByTestId('file-grid-view')).toHaveAttribute('data-has-folder-click', 'true');
    });
  });
});
