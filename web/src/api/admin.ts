import client from './client';
import type { ApiResponse, User, DiskInfo, SyncTask, OperationLog, WarnLog, MountInfo, DirEntry, DiskSimple } from '@/types';

/* ========== 用户管理 ========== */

interface UserListData {
  list: User[];
  total: number;
}

export function getUsers(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}): Promise<ApiResponse<UserListData>> {
  return client.get('/api/user/list', { params }).then((res) => res.data);
}

interface AddUserReq {
  username: string;
  password: string;
  nickname: string;
  role: number;
  storageQuota: number;
  diskId?: number;
}

export function addUser(data: AddUserReq): Promise<ApiResponse> {
  return client.post('/api/user/add', data).then((res) => res.data);
}

interface UpdateUserReq {
  nickname?: string;
  role?: number;
  storageQuota?: number;
  diskId?: number;
  status?: number;
}

export function updateUser(id: number, data: UpdateUserReq): Promise<ApiResponse> {
  return client.put(`/api/user/${id}`, data).then((res) => res.data);
}

export function deleteUser(id: number): Promise<ApiResponse> {
  return client.delete(`/api/user/${id}`).then((res) => res.data);
}

export function searchUsers(keyword: string): Promise<ApiResponse<User[]>> {
  return client.get('/api/user/search', { params: { q: keyword } }).then((res) => res.data);
}

/* ========== 磁盘管理 ========== */

export function getDiskInfo(): Promise<ApiResponse<DiskInfo[]>> {
  return client.get('/api/storage/disk_info').then((res) => res.data);
}

interface CreateDiskReq {
  diskPath: string;
  diskType: number;
  remark?: string;
}

export function createDisk(data: CreateDiskReq): Promise<ApiResponse<DiskInfo>> {
  return client.post('/api/storage/disk', data).then((res) => res.data);
}

interface UpdateDiskReq {
  diskPath?: string;
  diskType?: number;
  status?: number;
  remark?: string;
}

export function updateDisk(id: number, data: UpdateDiskReq): Promise<ApiResponse> {
  return client.put(`/api/storage/disk/${id}`, data).then((res) => res.data);
}

export function deleteDisk(id: number): Promise<ApiResponse> {
  return client.delete(`/api/storage/disk/${id}`).then((res) => res.data);
}

export function getSyncTask(): Promise<ApiResponse<SyncTask>> {
  return client.get('/api/storage/sync_task').then((res) => res.data);
}

interface UpdateSyncTaskReq {
  syncMode: number;
  cronExpr: string;
  ignoreSuffix?: string;
  speedLimit?: number;
}

export function updateSyncTask(data: UpdateSyncTaskReq): Promise<ApiResponse> {
  return client.put('/api/storage/sync_task', data).then((res) => res.data);
}

export function manualSync(): Promise<ApiResponse> {
  return client.post('/api/storage/sync/manual').then((res) => res.data);
}

/* ========== 同步日志 ========== */

export function getSyncLogs(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ list: OperationLog[]; total: number }>> {
  return client.get('/api/storage/sync/logs', { params }).then((res) => res.data);
}

/* ========== 告警管理 ========== */

export function getWarnLogs(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ list: WarnLog[]; total: number }>> {
  return client.get('/api/log/warn', { params }).then((res) => res.data);
}

export function readWarns(ids: number[]): Promise<ApiResponse> {
  return client.post('/api/log/warn/read', { ids }).then((res) => res.data);
}

/* ========== 磁盘扫描与目录操作 ========== */

export function scanMounts(): Promise<ApiResponse<MountInfo[]>> {
  return client.get('/api/storage/scan_mounts').then((res) => res.data);
}

export function browseDirs(path: string): Promise<ApiResponse<DirEntry[]>> {
  return client.get('/api/storage/browse_dirs', { params: { path } }).then((res) => res.data);
}

export function createDir(parentPath: string, dirName: string): Promise<ApiResponse> {
  return client.post('/api/storage/dir', { parentPath, dirName }).then((res) => res.data);
}

export function deleteDir(path: string): Promise<ApiResponse> {
  return client.delete('/api/storage/dir', { data: { path } }).then((res) => res.data);
}

export function getDiskSimple(): Promise<ApiResponse<DiskSimple[]>> {
  return client.get('/api/storage/disk_simple').then((res) => res.data);
}

/* ========== 服务器状态 ========== */

export function getServerInfo(): Promise<ApiResponse<any>> {
  return client.get('/api/lan/server_info').then((res) => res.data);
}
