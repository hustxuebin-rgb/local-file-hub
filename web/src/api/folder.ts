import client from './client';
import type { ApiResponse, Folder } from '@/types';

/** 获取文件夹列表（按父节点） */
export function listFolders(parentId: number | null): Promise<ApiResponse<Folder[]>> {
  return client
    .get('/api/folder', { params: { parentId } })
    .then((res) => res.data);
}

/** 创建文件夹 */
export function createFolder(data: {
  parentId: number | null;
  folderName: string;
  isPublic?: number;
}): Promise<ApiResponse> {
  return client.post('/api/folder', data).then((res) => res.data);
}

/** 重命名文件夹 */
export function renameFolder(id: number, folderName: string): Promise<ApiResponse> {
  return client.put(`/api/folder/${id}`, { folderName }).then((res) => res.data);
}

/** 移动文件夹 */
export function moveFolder(folderId: number, targetParentId: number): Promise<ApiResponse> {
  return client.post('/api/folder/move', { folderId, targetParentId }).then((res) => res.data);
}

/** 删除文件夹 */
export function deleteFolder(id: number): Promise<ApiResponse> {
  return client.delete(`/api/folder/${id}`).then((res) => res.data);
}

/** 获取文件夹树形结构 */
export function getTree(params?: { isPublic?: number }): Promise<ApiResponse<Folder[]>> {
  return client.get('/api/folder/tree', { params }).then((res) => res.data);
}

/* ========== 批量创建文件夹 ========== */

export interface BatchFolderItem {
  tempKey: string;
  folderName: string;
}

export interface BatchFolderResult {
  tempKey: string;
  id: number;
  folderName: string;
  status: 'created' | 'reused';
}

export interface BatchCreateFoldersData {
  parentId: number | null;
  isPublic?: number;
  folders: BatchFolderItem[];
}

export function batchCreateFolders(
  data: BatchCreateFoldersData,
): Promise<ApiResponse<{ folders: BatchFolderResult[] }>> {
  return client.post('/api/folder/batch', data).then((res) => res.data);
}

/** 更新文件夹可见性 */
export function updateFolderVisibility(id: number, visibility: number, password?: string): Promise<ApiResponse> {
  return client.put(`/api/folder/${id}/visibility`, { visibility, password }).then((res) => res.data);
}
