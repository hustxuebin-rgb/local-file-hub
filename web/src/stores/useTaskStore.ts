import { create } from 'zustand';
import type { UploadTaskItem, DownloadTaskItem, TaskStats } from '@/types';
import type { UnifiedTaskItem } from '@/api/file';

export interface TaskCallbacks {
  onResumeUpload?: (task: UploadTaskItem) => void;
  onPauseUpload?: (task: UploadTaskItem) => void;
  onCancelUpload?: (task: UploadTaskItem) => void;
  onResumeDownload?: (task: DownloadTaskItem) => void;
  onPauseDownload?: (task: DownloadTaskItem) => void;
  onCancelDownload?: (task: DownloadTaskItem) => void;
}

interface TaskState {
  uploadTasks: UploadTaskItem[];
  downloadTasks: DownloadTaskItem[];
  panelVisible: boolean;
  activeTab: 'upload' | 'download';
  callbacks: TaskCallbacks;

  // 任务中心页面
  taskStats: TaskStats | null;
  historyTasks: UnifiedTaskItem[];
  historyTotal: number;
  historyPage: number;
  selectedTaskIds: string[];

  setUploadTasks: (tasks: UploadTaskItem[]) => void;
  addUploadTask: (task: UploadTaskItem) => void;
  updateUploadTask: (id: string, updates: Partial<UploadTaskItem>) => void;
  removeUploadTask: (id: string) => void;

  setDownloadTasks: (tasks: DownloadTaskItem[]) => void;
  addDownloadTask: (task: DownloadTaskItem) => void;
  updateDownloadTask: (id: string, updates: Partial<DownloadTaskItem>) => void;
  removeDownloadTask: (id: string) => void;

  togglePanel: (visible?: boolean) => void;
  setActiveTab: (tab: 'upload' | 'download') => void;
  setCallbacks: (cb: TaskCallbacks) => void;

  // 任务中心 actions
  setTaskStats: (stats: TaskStats | null) => void;
  setHistoryTasks: (tasks: UnifiedTaskItem[], total: number, page: number) => void;
  setSelectedTaskIds: (ids: string[]) => void;
  toggleSelectTask: (id: string) => void;
  selectAllTasks: (ids: string[]) => void;
  clearSelection: () => void;

  activeTaskCount: () => number;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  uploadTasks: [],
  downloadTasks: [],
  panelVisible: false,
  activeTab: 'upload',
  callbacks: {},

  // 任务中心页面
  taskStats: null,
  historyTasks: [],
  historyTotal: 0,
  historyPage: 1,
  selectedTaskIds: [],

  setUploadTasks: (tasks) => set({ uploadTasks: tasks }),

  addUploadTask: (task) =>
    set((state) => {
      const exists = state.uploadTasks.find((t) => t.id === task.id);
      if (exists) {
        return {
          uploadTasks: state.uploadTasks.map((t) => (t.id === task.id ? task : t)),
        };
      }
      return { uploadTasks: [...state.uploadTasks, task] };
    }),

  updateUploadTask: (id, updates) =>
    set((state) => ({
      uploadTasks: state.uploadTasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeUploadTask: (id) =>
    set((state) => ({
      uploadTasks: state.uploadTasks.filter((t) => t.id !== id),
    })),

  setDownloadTasks: (tasks) => set({ downloadTasks: tasks }),

  addDownloadTask: (task) =>
    set((state) => {
      const exists = state.downloadTasks.find((t) => t.id === task.id);
      if (exists) {
        return {
          downloadTasks: state.downloadTasks.map((t) => (t.id === task.id ? task : t)),
        };
      }
      return { downloadTasks: [...state.downloadTasks, task] };
    }),

  updateDownloadTask: (id, updates) =>
    set((state) => ({
      downloadTasks: state.downloadTasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeDownloadTask: (id) =>
    set((state) => ({
      downloadTasks: state.downloadTasks.filter((t) => t.id !== id),
    })),

  togglePanel: (visible) =>
    set((state) => ({
      panelVisible: visible !== undefined ? visible : !state.panelVisible,
    })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setCallbacks: (cb) => set({ callbacks: cb }),

  // 任务中心 actions
  setTaskStats: (stats) => set({ taskStats: stats }),

  setHistoryTasks: (tasks, total, page) =>
    set({ historyTasks: tasks, historyTotal: total, historyPage: page }),

  setSelectedTaskIds: (ids) => set({ selectedTaskIds: ids }),

  toggleSelectTask: (id) =>
    set((state) => {
      const exists = state.selectedTaskIds.includes(id);
      return {
        selectedTaskIds: exists
          ? state.selectedTaskIds.filter((i) => i !== id)
          : [...state.selectedTaskIds, id],
      };
    }),

  selectAllTasks: (ids) => set({ selectedTaskIds: ids }),

  clearSelection: () => set({ selectedTaskIds: [] }),

  activeTaskCount: () => {
    const state = get();
    const uploadActive = state.uploadTasks.filter(
      (t) => t.status === 'pending' || t.status === 'uploading' || t.status === 'paused',
    ).length;
    const downloadActive = state.downloadTasks.filter(
      (t) => t.status === 'downloading' || t.status === 'paused',
    ).length;
    return uploadActive + downloadActive;
  },
}));
