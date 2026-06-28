import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listFiles, getTree } from '@/api';
import type { FileInfo, Folder } from '@/types';

/** 递归更新文件夹树中某个节点的可见性 */
function updateFolderTreeVisibility(nodes: Folder[], folderId: number, visibility: number): Folder[] {
  return nodes.map((node) => {
    if (node.id === folderId) {
      return { ...node, isPublic: visibility };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: updateFolderTreeVisibility(node.children, folderId, visibility) };
    }
    return node;
  });
}

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
  /** 获取文件夹树，isPublic 按可见性过滤 */
  fetchTree: (isPublic?: number) => Promise<void>;
  /** 本地更新单个文件的可见性（不重新拉取，避免分区过滤导致文件消失） */
  updateLocalFileVisibility: (fileId: number, visibility: number) => void;
  /** 本地更新文件夹树中单个文件夹的可见性 */
  updateLocalFolderVisibility: (folderId: number, visibility: number) => void;
}

// 请求序列号，用于丢弃过期响应（竞态防护）
let fileRequestSeq = 0;

// 树请求序列号
let treeRequestSeq = 0;

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
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
        const seq = ++fileRequestSeq;
        const { currentPartition, currentFolderId } = get();
        set({ loading: true });
        try {
          // Bug 2 修复：搜索时忽略 folderId，全局搜索当前分区
          const effectiveFolderId = params?.keyword ? null : currentFolderId;
          const res = await listFiles({
            partition: currentPartition,
            folderId: effectiveFolderId,
            page: params?.page ?? 1,
            pageSize: params?.pageSize ?? 50,
            keyword: params?.keyword,
            fileType: params?.fileType,
            sortBy: params?.sortBy,
            sortOrder: params?.sortOrder,
          });
          // 防止竞态：有更新的请求发起，丢弃过期响应
          if (seq !== fileRequestSeq) return;
          if (res.data) {
            set({ fileList: res.data.list, total: res.data.total });
          }
        } finally {
          if (seq === fileRequestSeq) set({ loading: false });
        }
      },

      fetchTree: async (isPublic?: number) => {
        const seq = ++treeRequestSeq;
        try {
          const res = await getTree({ isPublic });
          if (seq !== treeRequestSeq) return;
          if (res.data) {
            set({ folderTree: res.data });
          }
        } catch {
          // 树形数据加载失败不阻塞
        }
      },

      updateLocalFileVisibility: (fileId: number, visibility: number) => {
        set((state) => ({
          fileList: state.fileList.map((f) =>
            f.id === fileId ? { ...f, visibility } : f
          ),
        }));
      },

      updateLocalFolderVisibility: (folderId: number, visibility: number) => {
        set((state) => ({
          folderTree: updateFolderTreeVisibility(state.folderTree, folderId, visibility),
        }));
      },
    }),
    {
      name: 'file-manager-store',
      partialize: (state) => ({ currentPartition: state.currentPartition }),
    }
  )
);
