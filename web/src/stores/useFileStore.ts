import { create } from 'zustand';
import { listFiles, getTree } from '@/api';
import type { FileInfo, Folder } from '@/types';

interface FileState {
  /** 当前分区：0=私有 1=公共 2=分享 */
  currentPartition: number;
  /** 当前浏览的文件夹 ID */
  currentFolderId: number | null;
  /** 当前文件列表 */
  fileList: FileInfo[];
  /** 文件总数 */
  total: number;
  /** 文件夹树形结构 */
  folderTree: Folder[];
  /** 加载状态 */
  loading: boolean;

  /** 设置分区 */
  setPartition: (partition: number) => void;
  /** 设置当前文件夹 ID */
  setFolderId: (id: number | null) => void;
  /** 获取文件列表 */
  fetchFiles: (params?: { page?: number; pageSize?: number }) => Promise<void>;
  /** 获取文件夹树 */
  fetchTree: () => Promise<void>;
}

export const useFileStore = create<FileState>((set, get) => ({
  currentPartition: 0,
  currentFolderId: null,
  fileList: [],
  total: 0,
  folderTree: [],
  loading: false,

  setPartition: (partition: number) => {
    set({ currentPartition: partition, currentFolderId: null });
    get().fetchFiles();
  },

  setFolderId: (id: number | null) => {
    set({ currentFolderId: id });
    get().fetchFiles();
  },

  fetchFiles: async (params?: { page?: number; pageSize?: number }) => {
    const { currentPartition, currentFolderId } = get();
    set({ loading: true });
    try {
      const res = await listFiles({
        partition: currentPartition,
        folderId: currentFolderId,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 50,
      });
      if (res.data) {
        set({ fileList: res.data.list, total: res.data.total });
      }
    } finally {
      set({ loading: false });
    }
  },

  fetchTree: async () => {
    try {
      const { currentPartition } = get();
      const res = await getTree({ isPublic: currentPartition });
      if (res.data) {
        set({ folderTree: res.data });
      }
    } catch {
      // 树形数据加载失败不阻塞
    }
  },
}));
