import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  Upload,
  TreeSelect,
  Button,
  Table,
  Progress,
  message,
  Space,
  Typography,
  Tag,
  Modal,
  Alert,
  Input,
  Switch,
  Segmented,
} from 'antd';
import { InboxOutlined, ReloadOutlined, PlusOutlined, FolderAddOutlined } from '@ant-design/icons';
import {
  uploadInit,
  uploadChunk,
  uploadMerge,
  uploadCancel,
  getTree,
  createFolder,
  batchCreateFolders,
} from '@/api';
import type { BatchFolderItem } from '@/api/folder';
import { getErrorMessage } from '@/utils/errorCodes';
import type { Folder } from '@/types';

const { Dragger } = Upload;
const { Text } = Typography;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

interface UploadTask {
  uid: string;
  fileName: string;
  filePath?: string; // 文件夹上传时文件的相对路径
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped';
}

interface ConflictInfo {
  fileName: string;
  conflictFileId: number;
}

/** 文件夹条目项 */
interface FolderEntryItem {
  path: string;
  fileName: string;
  file: File;
}

function UploadPage(): React.ReactNode {
  const [partition, setPartition] = useState<number>(0);
  const [folderTree, setFolderTree] = useState<Folder[]>([]);
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);
  const [conflictModal, setConflictModal] = useState<ConflictInfo | null>(null);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderSubmitting, setCreateFolderSubmitting] = useState(false);
  const [newFolderIsPublic, setNewFolderIsPublic] = useState(0);
  const chunksRef = useRef<Map<string, string>>(new Map());
  // 冲突弹窗队列：并发场景下多个文件同时冲突时排队处理
  const conflictQueueRef = useRef<
    Array<{
      fileName: string;
      conflictFileId: number;
      resolve: (choice: 'replace' | 'keepBoth' | 'cancel') => void;
    }>
  >([]);
  // 使用 ref 跟踪总数，避免并发场景下的闭包陷阱
  const totalRef = useRef(0);
  // 文件夹上传统计
  const folderCountRef = useRef(0);
  const [folderCount, setFolderCount] = useState(0);

  // 隐藏的文件夹选择 input ref
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 检查 webkitGetAsEntry 是否可用
  const supportsFolderUpload = ((): boolean => {
    if (typeof DataTransferItem === 'undefined') return false;
    return 'webkitGetAsEntry' in DataTransferItem.prototype;
  })();

  const loadFolderTree = async (p?: number) => {
    try {
      const isPublic = p !== undefined ? p : partition;
      const res = await getTree({ isPublic });
      if (res.data) {
        setFolderTree(res.data);
      }
    } catch {
      // 静默失败
    }
  };

  // 弹出下一个冲突弹窗
  const popNextConflict = useCallback(() => {
    if (conflictQueueRef.current.length === 0) return;
    const item = conflictQueueRef.current[0];
    setConflictModal({ fileName: item.fileName, conflictFileId: item.conflictFileId });
  }, []);

  // 处理冲突弹窗的用户选择（队列消费）
  const handleConflictChoice = useCallback(
    (choice: 'replace' | 'keepBoth' | 'cancel') => {
      const item = conflictQueueRef.current.shift();
      setConflictModal(null);
      if (item) {
        item.resolve(choice);
        // 处理队列中下一个冲突
        popNextConflict();
      }
    },
    [popNextConflict],
  );

  // 上传单个文件，返回冲突选择信息
  const uploadFile = async (file: File, folderUploadId?: number): Promise<void> => {
    const effectiveFolderId = folderUploadId !== undefined ? folderUploadId : targetFolderId;
    const taskUid = file.name + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // 不创建 pending 状态的任务，由调用方在批量处理前先添加到列表
    // 此函数假定调用方已通过 addTask 将任务加入列表

    try {
      const initRes = await uploadInit({
        fileName: file.name,
        fileSize: file.size,
        md5: '',
        folderId: effectiveFolderId,
        visibility: partition,
      });

      if (!initRes.data) {
        throw new Error('初始化上传失败');
      }

      const { taskId, quickDone, chunkSize, totalChunks, conflictExists, conflictFileId } =
        initRes.data;

      // 秒传
      if (quickDone) {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t,
          ),
        );
        return;
      }

      if (!taskId) {
        throw new Error('初始化上传失败: 未获取到taskId');
      }

      // 名称冲突检测：弹窗询问用户（队列模式，支持并发冲突）
      let overwriteFileId: number | undefined;
      if (conflictExists && conflictFileId) {
        const choice = await new Promise<'replace' | 'keepBoth' | 'cancel'>((resolve) => {
          const isFirst = conflictQueueRef.current.length === 0;
          conflictQueueRef.current.push({ fileName: file.name, conflictFileId, resolve });
          if (isFirst) {
            popNextConflict();
          }
        });

        if (choice === 'cancel') {
          // 取消该文件上传
          await uploadCancel(taskId);
          setUploadTasks((prev) =>
            prev.map((t) => (t.uid === taskUid ? { ...t, status: 'skipped' as const } : t)),
          );
          return;
        }

        if (choice === 'replace') {
          overwriteFileId = conflictFileId;
        }
        // keepBoth: 不设 overwriteFileId，走自动重名
      }

      // 更新状态为上传中
      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'uploading' as const } : t)),
      );

      const effectiveChunkSize = chunkSize ?? CHUNK_SIZE;
      const chunks = totalChunks ?? Math.max(1, Math.ceil(file.size / effectiveChunkSize));
      chunksRef.current.set(taskUid, taskId);

      // 分片上传
      for (let i = 0; i < chunks; i++) {
        const start = i * effectiveChunkSize;
        const end = Math.min(start + effectiveChunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('taskId', taskId);
        formData.append('chunkIndex', String(i));
        formData.append('file', chunk, file.name);

        await uploadChunk(formData);

        const progress = Math.round(((i + 1) / chunks) * 100);
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.uid === taskUid ? { ...t, progress, status: 'uploading' as const } : t,
          ),
        );
      }

      // 合并分片
      await uploadMerge({ taskId, overwriteFileId });

      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t)),
      );
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code;
      message.error(`${file.name} 上传失败: ${code ? getErrorMessage(code) : '网络错误，请重试'}`);
      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'error' as const } : t)),
      );
    }
  };

  /**
   * 递归遍历文件系统条目树（文件夹 + 文件）
   */
  async function traverseFileTree(
    entry: FileSystemEntry,
    basePath: string,
    files: FolderEntryItem[],
    folders: Map<string, string>,
  ): Promise<void> {
    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      // 记录文件夹路径 → 文件夹名称
      folders.set(currentPath, entry.name);

      // 读取子条目
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirEntry.createReader().readEntries(resolve, reject);
      });

      for (const childEntry of entries) {
        await traverseFileTree(childEntry, currentPath, files, folders);
      }
    } else if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      files.push({
        path: basePath, // 文件所在文件夹的相对路径
        fileName: fileEntry.name,
        file,
      });
    }
  }

  /**
   * 将文件夹条目列表收集为 folderPath → folderName 映射并去重
   * 同时按路径排序，确保父文件夹在子文件夹之前
   */
  function buildFolderMap(folders: Map<string, string>): Map<string, string> {
    // 收集所有唯一的文件夹路径
    const allPaths = new Set<string>();
    for (const [path] of folders) {
      // 拆分路径，确保每个中间路径也被包含
      const parts = path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        allPaths.add(parts.slice(0, i).join('/'));
      }
    }

    // 按路径深度排序
    const sorted = Array.from(allPaths).sort((a, b) => a.split('/').length - b.split('/').length);

    const result = new Map<string, string>();
    for (const path of sorted) {
      const folderName = path.split('/').pop() || path;
      result.set(path, folderName);
    }
    return result;
  }

  /**
   * 处理文件夹上传
   */
  const handleFolderUpload = async (entries: FolderEntryItem[], folderMap: Map<string, string>) => {
    if (!targetFolderId) {
      message.warning('请先选择目标文件夹');
      return;
    }

    // Step 1: 构建唯一的文件夹列表
    const uniqueFolders = buildFolderMap(folderMap);

    // Step 2: 构建文件夹结构关系，用于批量创建和映射
    // pathDepth → folderName，按路径排序
    const sortedFolderPaths = Array.from(uniqueFolders.keys()).sort(
      (a, b) => a.split('/').length - b.split('/').length,
    );

    // 需要创建文件夹的路径列表（存在嵌套关系）
    // 我们采用逐层创建策略：同一层的文件夹批量创建
    const folderPathToTempKey = new Map<string, string>();
    const folderPathToRealId = new Map<string, number>();

    // 为每个文件夹路径生成 tempKey
    for (const folderPath of sortedFolderPaths) {
      folderPathToTempKey.set(folderPath, `__folder_${folderPath.replace(/\//g, '_')}`);
    }

    // 按层级分组
    const depthGroups = new Map<number, string[]>();
    for (const folderPath of sortedFolderPaths) {
      const depth = folderPath.split('/').length;
      if (!depthGroups.has(depth)) depthGroups.set(depth, []);
      depthGroups.get(depth)!.push(folderPath);
    }

    try {
      // 逐层创建文件夹：同一 parentId 的文件夹合并为一次批量调用
      const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
      for (const depth of sortedDepths) {
        const paths = depthGroups.get(depth)!;

        // 按 parentId 分组
        const parentIdGroups = new Map<string, string[]>();
        for (const folderPath of paths) {
          let parentFolderId: number | null = targetFolderId;
          if (depth > 1) {
            const parentPath = folderPath.split('/').slice(0, -1).join('/');
            const parentRealId = folderPathToRealId.get(parentPath);
            if (parentRealId !== undefined) {
              parentFolderId = parentRealId;
            }
          }
          const parentKey = String(parentFolderId);
          if (!parentIdGroups.has(parentKey)) {
            parentIdGroups.set(parentKey, []);
          }
          parentIdGroups.get(parentKey)!.push(folderPath);
        }

        // 每组调用一次 batchCreateFolders
        for (const [parentKey, groupPaths] of parentIdGroups) {
          const parentFolderId: number | null =
            parentKey === 'null' ? null : Number(parentKey);

          const folderItems: BatchFolderItem[] = groupPaths.map((folderPath) => ({
            tempKey: folderPathToTempKey.get(folderPath)!,
            folderName: uniqueFolders.get(folderPath)!,
          }));

          const res = await batchCreateFolders({
            parentId: parentFolderId,
            isPublic: partition,
            folders: folderItems,
          });

          if (res.data?.folders && res.data.folders.length > 0) {
            // 按 tempKey 匹配结果，支持批量返回
            const resultMap = new Map<string, number>();
            for (const result of res.data.folders) {
              if (result.status === 'created' || result.status === 'reused') {
                resultMap.set(result.tempKey, result.id);
              }
            }
            for (const folderPath of groupPaths) {
              const tempKey = folderPathToTempKey.get(folderPath)!;
              const realId = resultMap.get(tempKey);
              if (realId !== undefined) {
                folderPathToRealId.set(folderPath, realId);
              }
            }
          }
        }
      }

      // Step 3: 获取每个文件对应的实际 folderId
      const filesWithFolderId = entries.map((entry) => {
        const folderRealId = entry.path ? folderPathToRealId.get(entry.path) : undefined;
        return {
          ...entry,
          folderId: folderRealId !== undefined ? folderRealId : targetFolderId,
        };
      });

      // Step 4: 批量上传文件
      totalRef.current = filesWithFolderId.length;
      folderCountRef.current = sortedFolderPaths.length;
      setFolderCount(sortedFolderPaths.length);
      setQueueTotal(filesWithFolderId.length);
      setUploading(true);

      // 先添加所有任务到列表
      const taskUids: string[] = [];
      for (const entry of filesWithFolderId) {
        const uid =
          entry.fileName + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        taskUids.push(uid);
        const displayPath = entry.path
          ? `${entry.path}/${entry.fileName}`
          : entry.fileName;
        const task: UploadTask = {
          uid,
          fileName: entry.fileName,
          filePath: displayPath,
          fileSize: entry.file.size,
          progress: 0,
          status: 'pending',
        };
        setUploadTasks((prev) => [...prev, task]);
      }

      // 并发上传（逐个文件，每个文件内部是并发分片）
      for (let i = 0; i < filesWithFolderId.length; i++) {
        const entry = filesWithFolderId[i];
        const uid = taskUids[i];
        await uploadFileWithUid(entry.file, uid, entry.folderId);
      }

      setUploading(false);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code, '文件夹创建失败'));
      setUploading(false);
    }
  };

  /**
   * 带 uid 的上传（文件夹上传场景，任务已在列表中）
   */
  const uploadFileWithUid = async (
    file: File,
    taskUid: string,
    folderId: number | null,
  ): Promise<void> => {
    try {
      const initRes = await uploadInit({
        fileName: file.name,
        fileSize: file.size,
        md5: '',
        folderId,
        visibility: partition,
      });

      if (!initRes.data) {
        throw new Error('初始化上传失败');
      }

      const { taskId, quickDone, chunkSize, totalChunks, conflictExists, conflictFileId } =
        initRes.data;

      if (quickDone) {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t,
          ),
        );
        updateQueueProgress();
        return;
      }

      if (!taskId) {
        throw new Error('初始化上传失败: 未获取到taskId');
      }

      let overwriteFileId: number | undefined;
      if (conflictExists && conflictFileId) {
        const choice = await new Promise<'replace' | 'keepBoth' | 'cancel'>((resolve) => {
          const isFirst = conflictQueueRef.current.length === 0;
          conflictQueueRef.current.push({ fileName: file.name, conflictFileId, resolve });
          if (isFirst) {
            popNextConflict();
          }
        });

        if (choice === 'cancel') {
          await uploadCancel(taskId);
          setUploadTasks((prev) =>
            prev.map((t) => (t.uid === taskUid ? { ...t, status: 'skipped' as const } : t)),
          );
          updateQueueProgress();
          return;
        }

        if (choice === 'replace') {
          overwriteFileId = conflictFileId;
        }
      }

      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'uploading' as const } : t)),
      );

      const effectiveChunkSize = chunkSize ?? CHUNK_SIZE;
      const chunks = totalChunks ?? Math.max(1, Math.ceil(file.size / effectiveChunkSize));
      chunksRef.current.set(taskUid, taskId);

      for (let i = 0; i < chunks; i++) {
        const start = i * effectiveChunkSize;
        const end = Math.min(start + effectiveChunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('taskId', taskId);
        formData.append('chunkIndex', String(i));
        formData.append('file', chunk, file.name);

        await uploadChunk(formData);

        const progress = Math.round(((i + 1) / chunks) * 100);
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.uid === taskUid ? { ...t, progress, status: 'uploading' as const } : t,
          ),
        );
      }

      await uploadMerge({ taskId, overwriteFileId });

      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t)),
      );
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code;
      message.error(`${file.name} 上传失败: ${code ? getErrorMessage(code) : '网络错误，请重试'}`);
      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'error' as const } : t)),
      );
    } finally {
      updateQueueProgress();
    }
  };

  /**
   * 更新队列进度
   */
  const updateQueueProgress = () => {
    setUploadTasks((prev) => {
      const done = prev.filter(
        (t) => t.status === 'done' || t.status === 'error' || t.status === 'skipped',
      ).length;
      setQueueIndex(done);
      return prev;
    });
  };

  // 批量上传：每个文件独立创建异步任务，并发执行
  const customRequest = () => {};

  // 构建 TreeSelect 所需的树形数据
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildTreeData = (folders: Folder[]): any[] => {
    return folders.map((f) => ({
      value: f.id,
      title: f.folderName,
      children: f.children ? buildTreeData(f.children) : undefined,
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const treeData: any[] = buildTreeData(folderTree);

  // 新建文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    setCreateFolderSubmitting(true);
    try {
      await createFolder({
        parentId: targetFolderId,
        folderName: newFolderName.trim(),
        isPublic: newFolderIsPublic,
      });
      message.success('文件夹创建成功');
      setCreateFolderModalOpen(false);
      setNewFolderName('');
      setNewFolderIsPublic(0);
      await loadFolderTree();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setCreateFolderSubmitting(false);
    }
  };

  /**
   * 单文件上传入口（拖拽/点击选择普通文件）
   */
  const handleBeforeUpload = (file: File): boolean => {
    if (!targetFolderId) {
      message.warning('请先选择目标文件夹');
      return false;
    }
    totalRef.current += 1;
    folderCountRef.current = 0;
    setFolderCount(0);
    setQueueTotal(totalRef.current);
    setUploading(true);

    const taskUid =
      file.name + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const task: UploadTask = {
      uid: taskUid,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'pending',
    };
    setUploadTasks((prev) => [...prev, task]);

    uploadFileWithUid(file, taskUid, targetFolderId).finally(() => {
      setUploadTasks((prev) => {
        const done = prev.filter(
          (t) => t.status === 'done' || t.status === 'error' || t.status === 'skipped',
        ).length;
        setQueueIndex(done);
        if (done >= totalRef.current) {
          setUploading(false);
          totalRef.current = 0;
        }
        return prev;
      });
    });
    return false;
  };

  /**
   * 处理通过原生 input 选择的文件夹
   */
  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!targetFolderId) {
      message.warning('请先选择目标文件夹');
      // 重置 input
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }

    // 从文件列表中反推文件夹结构
    // webkitRelativePath 提供了相对路径信息
    const folderMap = new Map<string, string>();
    const entries: FolderEntryItem[] = [];
    const seenFolders = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // webkitRelativePath 格式：顶层文件夹名/子文件夹/.../文件名
      const relativePath: string =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const pathParts = relativePath.split('/');
      const fileName = pathParts.pop()!;
      const dirPath = pathParts.join('/');

      if (dirPath) {
        // 递归添加所有父级路径
        const parts = dirPath.split('/');
        for (let j = 0; j < parts.length; j++) {
          const ancestorPath = parts.slice(0, j + 1).join('/');
          if (!seenFolders.has(ancestorPath)) {
            seenFolders.add(ancestorPath);
            folderMap.set(ancestorPath, parts[j]);
          }
        }
      }

      entries.push({
        path: dirPath,
        fileName,
        file,
      });
    }

    if (entries.length === 0) return;

    await handleFolderUpload(entries, folderMap);
    // 重置 input
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  /**
   * 处理 Dragger 区域的文件夹拖拽
   */
  const handleDraggerChange = (event: React.DragEvent) => {
    // 检测拖拽的文件是否包含目录结构
    const dt = event.dataTransfer;
    if (dt && dt.items && dt.items.length > 0) {
      // 检查是否有文件夹条目（通过 webkitGetAsEntry）
      const hasDirectory = Array.from(dt.items).some((item) => {
        if ('webkitGetAsEntry' in item) {
          const entry = (item as DataTransferItem & { webkitGetAsEntry: () => FileSystemEntry | null }).webkitGetAsEntry();
          return entry?.isDirectory;
        }
        return false;
      });

      if (hasDirectory) {
        // 阻止默认的 Dragger 行为
        event.preventDefault();
        event.stopPropagation();

        if (!targetFolderId) {
          message.warning('请先选择目标文件夹');
          return;
        }

        // 使用 webkitGetAsEntry 递归遍历
        const folderMap = new Map<string, string>();
        const entries: FolderEntryItem[] = [];
        const promises: Promise<void>[] = [];

        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if ('webkitGetAsEntry' in item) {
            const entry = (
              item as DataTransferItem & {
                webkitGetAsEntry: () => FileSystemEntry | null;
              }
            ).webkitGetAsEntry();
            if (entry) {
              promises.push(traverseFileTree(entry, '', entries, folderMap));
            }
          }
        }

        Promise.all(promises).then(() => {
          if (entries.length > 0) {
            handleFolderUpload(entries, folderMap);
          }
        });

        return;
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFolderTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partition]);

  useEffect(() => {
    const queueRef = conflictQueueRef;
    return () => {
      // 组件卸载时清理冲突弹窗队列，避免 Promise 永久挂起
      while (queueRef.current.length > 0) {
        queueRef.current.shift()!.resolve('cancel');
      }
      setConflictModal(null);
    };
  }, []);

  const columns = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    {
      title: '路径',
      dataIndex: 'filePath',
      key: 'filePath',
      width: 200,
      render: (path?: string) => (path ? <Text style={{ fontSize: 12, color: '#888' }}>{path}</Text> : '-'),
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => {
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress: number, record: UploadTask) => (
        <Progress
          percent={progress}
          size="small"
          status={record.status === 'error' ? 'exception' : undefined}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'default', text: '等待中' },
          uploading: { color: 'processing', text: '上传中' },
          done: { color: 'success', text: '已完成' },
          error: { color: 'error', text: '失败' },
          skipped: { color: 'warning', text: '已跳过' },
        };
        const s = statusMap[status] ?? { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
  ];

  return (
    <Card
      title="上传文件"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadFolderTree()}>
            刷新文件夹
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        {/* 分区选择 */}
        <Space>
          <Text strong>文件类型：</Text>
          <Segmented
            options={[
              { label: '私有文件', value: 0 },
              { label: '公共文件', value: 1 },
            ]}
            value={partition}
            onChange={(val) => {
              setPartition(val as number);
              setTargetFolderId(null);
            }}
          />
        </Space>

        {/* 目标文件夹选择 */}
        <Space>
          <Text strong>目标文件夹：</Text>
          <TreeSelect
            placeholder="请选择文件夹"
            style={{ width: 280 }}
            treeData={treeData}
            value={targetFolderId}
            onChange={(val) => setTargetFolderId(val)}
            allowClear
            treeDefaultExpandAll
          />
          <Button icon={<PlusOutlined />} onClick={() => setCreateFolderModalOpen(true)}>
            新建文件夹
          </Button>
          {!targetFolderId && (
            <Text type="warning">请先选择目标文件夹后再上传文件</Text>
          )}
        </Space>

        {/* 任务进度 */}
        {queueTotal > 0 && (
          <Alert
            type="info"
            showIcon
            message={
              uploading
                ? `上传中：已完成 ${queueIndex}/${queueTotal} 个文件${folderCount > 0 ? `（共 ${folderCount} 个文件夹）` : ''}`
                : `全部上传完成（${queueTotal} 个文件${folderCount > 0 ? `，${folderCount} 个文件夹` : ''}）`
            }
          />
        )}

        {/* 拖拽上传区域 */}
        <Dragger
          name="file"
          multiple
          customRequest={customRequest}
          beforeUpload={handleBeforeUpload}
          showUploadList={false}
          disabled={!targetFolderId || uploading}
          onChange={(info) => {
            // 拦截拖拽事件以检测文件夹上传
            if (info.event) {
              handleDraggerChange(info.event as unknown as React.DragEvent);
            }
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持批量上传，文件将排队依次处理
          </p>
        </Dragger>

        {/* 文件夹选择按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={(el) => {
              (folderInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
              if (el) {
                el.setAttribute('webkitdirectory', '');
              }
            }}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFolderInputChange}
          />
          <Button
            icon={<FolderAddOutlined />}
            disabled={!targetFolderId || uploading}
            onClick={() => {
              if (!supportsFolderUpload) {
                message.warning('当前浏览器不支持文件夹上传，请使用 Chrome/Edge/Firefox 等现代浏览器');
                return;
              }
              folderInputRef.current?.click();
            }}
          >
            选择文件夹
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            支持上传整个文件夹（含子文件夹）
          </Text>
        </div>

        {/* 上传任务列表 */}
        {uploadTasks.length > 0 && (
          <Table<UploadTask>
            rowKey="uid"
            columns={columns}
            dataSource={uploadTasks}
            pagination={false}
            size="small"
          />
        )}

        {/* 名称冲突确认弹窗 */}
        <Modal
          title="文件名冲突"
          open={conflictModal !== null}
          onCancel={() => handleConflictChoice('cancel')}
          footer={[
            <Button key="cancel" onClick={() => handleConflictChoice('cancel')}>
              取消上传
            </Button>,
            <Button key="keep" onClick={() => handleConflictChoice('keepBoth')}>
              保留两者
            </Button>,
            <Button key="replace" type="primary" onClick={() => handleConflictChoice('replace')}>
              替换
            </Button>,
          ]}
        >
          <p>
            文件 <Text strong>{conflictModal?.fileName}</Text> 已存在，是否替换？
          </p>
          <p style={{ color: '#888', fontSize: 13 }}>
            替换将删除旧文件并上传新文件；保留两者将自动重命名新文件（如 hello(1).txt）。
          </p>
        </Modal>

        {/* 新建文件夹 Modal */}
        <Modal
          title="新建文件夹"
          open={createFolderModalOpen}
          onOk={handleCreateFolder}
          onCancel={() => {
            setCreateFolderModalOpen(false);
            setNewFolderName('');
          }}
          confirmLoading={createFolderSubmitting}
        >
          <Input
            placeholder="请输入文件夹名称"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolder}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>公共文件夹：</span>
            <Switch
              checked={newFolderIsPublic === 1}
              onChange={(v) => setNewFolderIsPublic(v ? 1 : 0)}
            />
          </div>
        </Modal>
      </Space>
    </Card>
  );
}

export default UploadPage;
