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
  visibility?: number;
  filePath?: string;
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

/* ========== 文件可见性 ========== */

export function updateFileVisibility(id: number, visibility: number, password?: string): Promise<ApiResponse> {
  return client.put(`/api/file/${id}/visibility`, { visibility, password }).then((res) => res.data);
}

/* ========== 断点续传与暂停恢复 ========== */

export interface UploadStatusResp {
  taskId: string;
  fileName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  finishedChunks: number[];
  finishedCount: number;
  status: number;
  progress: number;
}

export interface UploadResumeResp {
  taskId: string;
  fileName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  finishedChunks: number[];
  finishedCount: number;
}

export interface UploadTaskInfo {
  id: number;
  userId: number;
  taskId: string;
  fileName: string;
  filePath?: string;
  totalSize: number;
  chunkSize: number;
  totalChunk: number;
  finishedChunk: number;
  folderId: number;
  visibility: number;
  status: number;
  createTime: string;
}

export interface DownloadInitResp {
  taskId: string;
  fileName: string;
  totalSize: number;
  contentType?: string;
}

export function uploadStatus(taskId: string): Promise<ApiResponse<UploadStatusResp>> {
  return client.get('/api/file/upload/status', { params: { taskId } }).then((res) => res.data);
}

export function uploadPause(taskId: string): Promise<ApiResponse> {
  return client.post('/api/file/upload/pause', { taskId }).then((res) => res.data);
}

export function uploadResume(taskId: string): Promise<ApiResponse<UploadResumeResp>> {
  return client.post('/api/file/upload/resume', { taskId }).then((res) => res.data);
}

export function getUnfinishedUploads(): Promise<ApiResponse<UploadTaskInfo[]>> {
  return client.get('/api/file/upload/unfinished').then((res) => res.data);
}

export function downloadInit(fileId: number): Promise<ApiResponse<DownloadInitResp>> {
  return client.post('/api/file/download/init', { fileId }).then((res) => res.data);
}

/* ========== 下载任务管理 ========== */

export interface DownloadStatusResp {
  taskId: string;
  fileId: number;
  fileName: string;
  totalSize: number;
  downloadedSize: number;
  progress: number;
  status: number;
}

export interface DownloadTaskInfo {
  id: number;
  userId: number;
  taskId: string;
  fileId: number;
  fileName: string;
  filePath?: string;
  totalSize: number;
  downloadedSize: number;
  status: number;
  createTime: string;
  updateTime: string;
}

export function downloadStatus(taskId: string): Promise<ApiResponse<DownloadStatusResp>> {
  return client.get('/api/file/download/status', { params: { taskId } }).then((res) => res.data);
}

export function downloadPause(taskId: string): Promise<ApiResponse> {
  return client.post('/api/file/download/pause', { taskId }).then((res) => res.data);
}

export function downloadResume(taskId: string): Promise<ApiResponse> {
  return client.post('/api/file/download/resume', { taskId }).then((res) => res.data);
}

export function downloadCancel(taskId: string): Promise<ApiResponse> {
  return client.post('/api/file/download/cancel', { taskId }).then((res) => res.data);
}

export function downloadList(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ list: DownloadTaskInfo[]; total: number }>> {
  return client.get('/api/file/download/list', { params }).then((res) => res.data);
}

/* ========== 统一任务列表 ========== */

export interface UnifiedTaskItem {
  taskId: string;
  taskType: 'upload' | 'download';
  fileName: string;
  filePath?: string;
  totalSize: number;
  finishedSize: number;
  totalChunk: number;
  finishedChunk: number;
  fileId?: number;
  folderId?: number;
  visibility?: number;
  status: number;
  progress: number;
  createTime: string;
}

export function tasksList(): Promise<ApiResponse<UnifiedTaskItem[]>> {
  return client.get('/api/file/tasks').then((res) => res.data);
}

/* ========== 任务历史 ========== */

export interface TasksHistoryParams {
  type?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface TasksHistoryData {
  items: UnifiedTaskItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function tasksHistory(params: TasksHistoryParams): Promise<ApiResponse<TasksHistoryData>> {
  return client.get('/api/file/tasks/history', { params }).then((res) => res.data);
}

/* ========== 任务统计 ========== */

export interface TaskStatItem {
  count: number;
  totalSize: number;
  avgSpeed: number;
}

export interface TaskStatsData {
  upload: TaskStatItem;
  download: TaskStatItem;
}

export function tasksStats(): Promise<ApiResponse<TaskStatsData>> {
  return client.get('/api/file/tasks/stats').then((res) => res.data);
}

/* ========== 批量操作 ========== */

export interface TasksBatchReq {
  taskType: 'upload' | 'download';
  action: 'pause' | 'resume' | 'cancel';
  taskIds: string[];
}

export function tasksBatch(data: TasksBatchReq): Promise<ApiResponse> {
  return client.post('/api/file/tasks/batch', data).then((res) => res.data);
}
