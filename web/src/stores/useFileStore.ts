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
  fetchFiles: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    fileType?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => Promise<void>;
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
    // fetchFiles 由组件 useEffect 在 currentPartition 变化时自动触发，
    // 避免在此处直接调用导致与 useEffect 中的带参请求产生竞态条件
  },

  setFolderId: (id: number | null) => {
    set({ currentFolderId: id });
    // fetchFiles 由组件 useEffect 在 currentFolderId 变化时自动触发
  },

  fetchFiles: async (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    fileType?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const { currentPartition, currentFolderId } = get();
    set({ loading: true });
    try {
      const res = await listFiles({
        partition: currentPartition,
        folderId: currentFolderId,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 50,
        keyword: params?.keyword,
        fileType: params?.fileType,
        sortBy: params?.sortBy,
        sortOrder: params?.sortOrder,
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
      // 文件夹树不按 partition 过滤，始终展示全部文件夹
      const res = await getTree();
      if (res.data) {
        set({ folderTree: res.data });
      }
    } catch {
      // 树形数据加载失败不阻塞
    }
  },
}));
