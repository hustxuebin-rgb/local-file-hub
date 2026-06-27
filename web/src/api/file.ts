import client from './client';
import type { ApiResponse, FileInfo } from '@/types';

/* ========== 文件列表 ========== */

interface ListFilesParams {
  folderId?: number | null;
  partition?: number;
  keyword?: string;
  fileType?: number;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

interface FileListData {
  list: FileInfo[];
  total: number;
}

export function listFiles(params: ListFilesParams): Promise<ApiResponse<FileListData>> {
  return client.get('/api/file/list', { params }).then((res) => res.data);
}

/* ========== 文件操作 ========== */

export function getFileInfo(id: number): Promise<ApiResponse<FileInfo>> {
  return client.get(`/api/file/${id}/info`).then((res) => res.data);
}

export function downloadFile(id: number): Promise<Blob> {
  return client.get(`/api/file/${id}/download`, { responseType: 'blob' }).then((res) => res.data);
}

export function previewFile(id: number): Promise<Blob> {
  return client.get(`/api/file/${id}/preview`, { responseType: 'blob' }).then((res) => res.data);
}

export function deleteFile(id: number): Promise<ApiResponse> {
  return client.delete(`/api/file/${id}`).then((res) => res.data);
}

export function moveFile(id: number, targetFolderId: number): Promise<ApiResponse> {
  return client.post('/api/file/move', { fileId: id, targetFolderId }).then((res) => res.data);
}

/* ========== 分片上传 ========== */

interface UploadInitReq {
  fileName: string;
  fileSize: number;
  md5: string;
  folderId: number | null;
}

interface UploadInitResp {
  taskId: string;
  quickDone: boolean;
  fileId?: number;
  chunkSize?: number;
  totalChunks?: number;
  conflictExists: boolean;
  conflictFileId?: number;
}

export function uploadInit(data: UploadInitReq): Promise<ApiResponse<UploadInitResp>> {
  return client.post('/api/file/upload/init', data).then((res) => res.data);
}

export function uploadChunk(formData: FormData): Promise<ApiResponse> {
  return client
    .post('/api/file/upload/chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

interface UploadMergeReq {
  taskId: string;
  overwriteFileId?: number;
}

export function uploadMerge(data: UploadMergeReq): Promise<ApiResponse> {
  return client.post('/api/file/upload/merge', data).then((res) => res.data);
}

export function uploadCancel(taskId: string): Promise<ApiResponse> {
  return client.post('/api/file/upload/cancel', { taskId }).then((res) => res.data);
}

/* ========== 回收站 ========== */

export function recycleList(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<FileListData>> {
  return client.get('/api/file/recycle/list', { params }).then((res) => res.data);
}

export function recycleRecover(id: number): Promise<ApiResponse> {
  return client.post('/api/file/recycle/recover', { fileId: id }).then((res) => res.data);
}

export function recycleDelete(id: number): Promise<ApiResponse> {
  return client.post('/api/file/recycle/delete', { fileId: id }).then((res) => res.data);
}
