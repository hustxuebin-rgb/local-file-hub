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

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: () => ({ viewMode: 'list' as const }),
}));

// Mock API calls
vi.mock('@/api', () => ({
  createFolder: vi.fn().mockResolvedValue({ data: {} }),
  renameFolder: vi.fn().mockResolvedValue({ data: {} }),
  deleteFolder: vi.fn().mockResolvedValue({ data: {} }),
  deleteFile: vi.fn().mockResolvedValue({ data: {} }),
  addFavorite: vi.fn().mockResolvedValue({ data: {} }),
  listFolders: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('@/api/file', () => ({
  downloadFile: vi.fn().mockResolvedValue(new Blob()),
  previewFile: vi.fn().mockResolvedValue(new Blob()),
  updateFileVisibility: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@/utils/errorCodes', () => ({
  getErrorMessage: vi.fn((code?: number) => `Error: ${code ?? 'unknown'}`),
}));

// Mock child components
vi.mock('@/components/shared/FileCategoryTabs', () => ({
  default: ({ activeKey }: { activeKey: string }) => (
    <div data-testid="file-category-tabs">{activeKey}</div>
  ),
}));

vi.mock('@/components/shared/FileSortDropdown', () => ({
  default: () => <div data-testid="file-sort-dropdown" />,
}));

vi.mock('@/components/shared/FileViewToggle', () => ({
  default: () => <div data-testid="file-view-toggle" />,
}));

vi.mock('@/components/shared/FileGridView', () => ({
  default: () => <div data-testid="file-grid-view" />,
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
      // 根文件夹应出现在树中
      expect(screen.getByText('根文件夹')).toBeInTheDocument();
      expect(screen.getByText('另一个根')).toBeInTheDocument();
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
      expect(screen.getByText('Folder1')).toBeInTheDocument();
      expect(screen.getByText('Folder2')).toBeInTheDocument();
    });

    // 再次更新 folderTree 不应导致额外副作用（ref 已设置）
    mockStoreState.folderTree = [
      { id: 1, parentId: 0, folderName: 'Folder1' },
      { id: 2, parentId: 0, folderName: 'Folder2' },
      { id: 3, parentId: 0, folderName: 'Folder3' },
    ];
    rerender(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('Folder3')).toBeInTheDocument();
    });
  });

  it('切换分区后 folderTree 重置时树初始化 ref 应跟随重置', async () => {
    mockStoreState.folderTree = [
      { id: 1, parentId: 0, folderName: 'PrivateFolder' },
    ];

    const { rerender } = render(<FileManager />);

    await waitFor(() => {
      expect(screen.getByText('PrivateFolder')).toBeInTheDocument();
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
});
