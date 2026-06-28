import { useState, useRef, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { downloadInit } from '@/api/file';
import { getErrorMessage } from '@/utils/errorCodes';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTaskStore } from '@/stores/useTaskStore';
import type { DownloadTaskItem } from '@/types';

export interface DownloadState {
  fileId: number;
  taskId: string;
  fileName: string;
  totalSize: number;
  downloadedSize: number;
  progress: number;
  status: 'idle' | 'downloading' | 'paused' | 'done' | 'error';
}

interface UseDownloadReturn {
  downloadState: DownloadState | null;
  startDownload: (fileId: number) => Promise<void>;
  pauseDownload: () => void;
  resumeDownload: () => Promise<void>;
  cancelDownload: () => void;
}

/** 生成 store 中使用的唯一 id */
function makeStoreId(taskId: string): string {
  return `download_${taskId}`;
}

export function useDownload(): UseDownloadReturn {
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chunksRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const downloadedSizeRef = useRef(0);
  const stateRef = useRef<DownloadState | null>(null);

  // 组件卸载时清理 AbortController
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // 注册下载回调到 store，供 TaskManagerPanel 调用
  useEffect(() => {
    const store = useTaskStore.getState();
    store.setCallbacks({
      ...store.callbacks,
      onPauseDownload: () => {
        pauseDownload();
      },
      onResumeDownload: () => {
        resumeDownload();
      },
      onCancelDownload: () => {
        cancelDownload();
      },
    });
  }, []);

  const syncToStore = useCallback((state: DownloadState) => {
    const storeId = makeStoreId(state.taskId);
    const item: DownloadTaskItem = {
      id: storeId,
      taskId: state.taskId,
      fileId: state.fileId,
      fileName: state.fileName,
      totalSize: state.totalSize,
      downloadedSize: state.downloadedSize,
      status: state.status,
      progress: state.progress,
      createTime: new Date().toISOString(),
    };
    const actions = useTaskStore.getState();
    if (state.status === 'done' || state.status === 'error') {
      actions.addDownloadTask(item);
    } else {
      actions.addDownloadTask(item);
    }
  }, []);

  // 同步 state 到 ref，避免闭包陷阱
  const updateState = useCallback((updater: (prev: DownloadState | null) => DownloadState | null) => {
    setDownloadState((prev) => {
      const next = updater(prev);
      stateRef.current = next;
      if (next) {
        syncToStore(next);
      }
      return next;
    });
  }, [syncToStore]);

  const cancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const currentState = stateRef.current;
    if (currentState) {
      const storeId = makeStoreId(currentState.taskId);
      useTaskStore.getState().removeDownloadTask(storeId);
    }
    chunksRef.current.clear();
    downloadedSizeRef.current = 0;
    setDownloadState(null);
    stateRef.current = null;
  }, []);

  const pauseDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateState((prev) =>
      prev ? { ...prev, status: 'paused' as const } : null,
    );
  }, [updateState]);

  const completeDownload = useCallback((fileName: string) => {
    const chunks = chunksRef.current;
    const sortedKeys = Array.from(chunks.keys()).sort((a, b) => a - b);
    const blobParts: ArrayBuffer[] = [];
    for (const key of sortedKeys) {
      const chunk = chunks.get(key);
      if (chunk) {
        blobParts.push(chunk);
      }
    }

    const blob = new Blob(blobParts);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    chunksRef.current.clear();
    downloadedSizeRef.current = 0;
    updateState((prev) =>
      prev ? { ...prev, status: 'done' as const, progress: 100 } : null,
    );
  }, [updateState]);

  const doFetch = useCallback(
    async (fileId: number, startOffset: number) => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const rangeEnd = '';
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/file/${fileId}/download`,
          {
            headers: {
              Range: `bytes=${startOffset}-${rangeEnd}`,
              Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal: abortController.signal,
          },
        );

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('浏览器不支持流式读取');
        }

        let receivedLength = startOffset;
        const currentState = stateRef.current;
        const totalSize = currentState?.totalSize ?? 0;
        const chunkSize = Math.max(1024 * 1024, Math.ceil(totalSize / 100));

        const parts: Uint8Array[] = [];
        let chunkStartOffset = startOffset;
        let accumulatedSize = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            parts.push(value);
            receivedLength += value.length;
            accumulatedSize += value.length;

            if (accumulatedSize >= chunkSize) {
              const merged = new Uint8Array(
                parts.reduce((sum, p) => sum + p.length, 0),
              );
              let offset = 0;
              for (const p of parts) {
                merged.set(p, offset);
                offset += p.length;
              }
              chunksRef.current.set(chunkStartOffset, merged.buffer);
              chunkStartOffset += merged.length;
              parts.length = 0;
              accumulatedSize = 0;
            }

            downloadedSizeRef.current = receivedLength;

            const progress =
              totalSize > 0 ? Math.min(Math.round((receivedLength / totalSize) * 100), 99) : 0;

            updateState((prev) =>
              prev
                ? { ...prev, downloadedSize: receivedLength, progress, status: 'downloading' as const }
                : null,
            );
          }
        }

        if (parts.length > 0) {
          const merged = new Uint8Array(
            parts.reduce((sum, p) => sum + p.length, 0),
          );
          let offset = 0;
          for (const p of parts) {
            merged.set(p, offset);
            offset += p.length;
          }
          chunksRef.current.set(chunkStartOffset, merged.buffer);
        }

        const fileName = stateRef.current?.fileName ?? 'download';
        completeDownload(fileName);
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        const typedErr = err as { response?: { data?: { code?: number } } };
        message.error(getErrorMessage(typedErr.response?.data?.code, '下载失败'));
        updateState((prev) =>
          prev ? { ...prev, status: 'error' as const } : null,
        );
      }
    },
    [completeDownload, updateState],
  );

  const startDownload = useCallback(
    async (fileId: number) => {
      try {
        const res = await downloadInit(fileId);
        if (!res.data) {
          throw new Error('初始化下载失败');
        }

        const { taskId, fileName, totalSize } = res.data;

        const initialState: DownloadState = {
          fileId,
          taskId,
          fileName,
          totalSize,
          downloadedSize: 0,
          progress: 0,
          status: 'downloading',
        };

        setDownloadState(initialState);
        stateRef.current = initialState;
        chunksRef.current.clear();
        downloadedSizeRef.current = 0;

        // 同步到全局 store
        syncToStore(initialState);

        await doFetch(fileId, 0);
      } catch (err: unknown) {
        const typedErr = err as { response?: { data?: { code?: number } } };
        message.error(getErrorMessage(typedErr.response?.data?.code, '初始化下载失败'));
      }
    },
    [doFetch, syncToStore],
  );

  const resumeDownload = useCallback(async () => {
    const currentState = stateRef.current;
    if (!currentState || currentState.status !== 'paused') return;

    const offset = downloadedSizeRef.current;
    updateState((prev) =>
      prev ? { ...prev, status: 'downloading' as const } : null,
    );

    await doFetch(currentState.fileId, offset);
  }, [updateState, doFetch]);

  return {
    downloadState,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
  };
}
