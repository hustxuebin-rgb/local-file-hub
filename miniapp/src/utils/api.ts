import api from './request';

// ====== 认证相关 ======

export interface LoginReq {
  username: string;
  password: string;
  deviceType: number;
}

export interface LoginResp {
  token: string;
  user: UserInfo;
  deviceId: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  role: number;
  storageQuota: number;
  storageUsed: number;
}

export function login(data: LoginReq): Promise<LoginResp> {
  return api.post<LoginResp>('/api/auth/login', data);
}

export function logout(): Promise<void> {
  return api.post<void>('/api/auth/logout');
}

export function getCurrentUser(): Promise<UserInfo> {
  return api.get<UserInfo>('/api/auth/current_user');
}

// ====== 文件夹相关 ======

export interface Folder {
  id: number;
  folderName: string;
  parentId: number;
  fullPath: string;
  createTime: string;
}

export function listFolders(parentId?: number): Promise<Folder[]> {
  return api.get<Folder[]>('/api/folder', {
    skipErrorToast: true,
    params: parentId !== undefined ? { parentId } : undefined,
  });
}

export function createFolder(data: { parentId?: number; folderName: string }): Promise<void> {
  return api.post<void>('/api/folder', data);
}

// ====== 文件夹操作 ======

export function renameFolder(id: number, folderName: string): Promise<void> {
  return api.put<void>(`/api/folder/${id}`, { folderName });
}

export function deleteFolder(id: number): Promise<void> {
  return api.delete<void>(`/api/folder/${id}`);
}

export function moveFolder(folderId: number, targetParentId: number): Promise<void> {
  return api.post<void>('/api/folder/move', { folderId, targetParentId });
}

// ====== 文件相关 ======

export interface FileInfo {
  id: number;
  fileName: string;
  fileSize: number;
  fileType: number;
  fileSuffix: string;
  mimeType: string;
  folderId: number;
  createTime: string;
  fullPath: string;
}

export interface FileListResp {
  list: FileInfo[];
  total: number;
}

export interface FileListParams {
  folderId?: number;
  partition?: number;
  keyword?: string;
  fileType?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

export function listFiles(params?: FileListParams): Promise<FileListResp> {
  return api.get<FileListResp>('/api/file/list', {
    skipErrorToast: true,
    params: params as Record<string, unknown> | undefined,
  });
}

export function deleteFile(id: number): Promise<void> {
  return api.delete<void>(`/api/file/${id}`);
}

// ====== 分享相关 ======

export interface ShareRecord {
  id: number;
  resourceId: number;
  shareType: number;
  sharePerm: number;
  expireType: number;
  expireTime: string;
  status: number;
  shareUserName: string;
  receiveUserName: string;
  createTime: string;
}

export interface CreateShareReq {
  resourceId: number;
  shareType: number;
  receiveUserId: number;
  sharePerm: number;
  expireType: number;
}

export function createShare(data: CreateShareReq): Promise<void> {
  return api.post<void>('/api/share', data);
}

export function getMyShares(params?: { page?: number; pageSize?: number }): Promise<{ list: ShareRecord[]; total: number }> {
  return api.get<{ list: ShareRecord[]; total: number }>('/api/share/my', {
    params: params || undefined,
  });
}

export function getReceivedShares(params?: { page?: number; pageSize?: number }): Promise<{ list: ShareRecord[]; total: number }> {
  return api.get<{ list: ShareRecord[]; total: number }>('/api/share/received', {
    params: params || undefined,
  });
}

export function getShareContents(id: number): Promise<{ list: FileInfo[] }> {
  return api.get<{ list: FileInfo[] }>(`/api/share/${id}/contents`);
}

export function cancelShare(id: number): Promise<void> {
  return api.delete<void>(`/api/share/${id}`);
}

// ====== 小程序专用 ======

export function albumUpload(tempFiles: { path: string; size: number }[]): Promise<void> {
  return api.post<void>('/api/miniapp/album_upload', { files: tempFiles });
}

export function cameraUpload(tempFile: { path: string; size: number }): Promise<void> {
  return api.post<void>('/api/miniapp/camera_upload', tempFile);
}

export interface StorageStat {
  totalQuota: number;
  usedBytes: number;
  fileTypeStats: { fileType: string; count: number; totalBytes: number }[];
}

export function getStorageStat(): Promise<StorageStat> {
  return api.get<StorageStat>('/api/miniapp/storage_stat');
}

// ====== 公共文件 ======

export interface PublicFile extends FileInfo {
  uploaderName?: string;
}

export interface PublicFileListParams {
  keyword?: string;
  fileType?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

export function listPublicFiles(params?: PublicFileListParams): Promise<{ total: number; list: PublicFile[] }> {
  return api.get<{ total: number; list: PublicFile[] }>('/api/file/public', {
    skipErrorToast: true,
    params: params as Record<string, unknown> | undefined,
  });
}

// ====== 收藏相关 ======

export interface FavoriteItem {
  id: number;
  targetType: number;   // 1=文件, 2=文件夹, 3=分享
  targetId: number;
  targetName: string;
  targetSize: number;
  ownerName: string;
  createTime: string;
}

export function addFavorite(data: { targetType: number; targetId: number }): Promise<void> {
  return api.post<void>('/api/favorite', data);
}

export function removeFavorite(data: { targetType: number; targetId: number }): Promise<void> {
  return api.delete<void>(`/api/favorite?targetType=${data.targetType}&targetId=${data.targetId}`);
}

export function listFavorites(params?: { page?: number; pageSize?: number }): Promise<{ total: number; list: FavoriteItem[] }> {
  return api.get<{ total: number; list: FavoriteItem[] }>('/api/favorite/list', {
    skipErrorToast: true,
    params: params || undefined,
  });
}

// ====== 批量分享 ======

export interface BatchShareItem {
  resourceId: number;
  shareType: number;
  receiveUserId: number;
  sharePerm: number;
  expireType: number;
}

export function batchCreateShare(data: { items: BatchShareItem[] }): Promise<void> {
  return api.post<void>('/api/share/batch', data);
}

// ====== 操作记录 ======

export interface OperationLogItem {
  id: number;
  operType: number;
  operDesc: string;
  localIp: string;
  createTime: string;
}

export function getMyLogs(params?: { operType?: number; page?: number; pageSize?: number }): Promise<{ total: number; list: OperationLogItem[] }> {
  return api.get<{ total: number; list: OperationLogItem[] }>('/api/log/my', {
    skipErrorToast: true,
    params: params || undefined,
  });
}

// ====== 用户搜索 ======

export interface SearchUser {
  id: number;
  username: string;
  nickname: string;
}

export function searchUsers(keyword: string): Promise<SearchUser[]> {
  return api.get<SearchUser[]>('/api/user/search', { params: { keyword } });
}

// ====== Server 连接 ======

export interface ServerInfo {
  device_name?: string;
  local_ip?: string;
}

export function getServerInfo(): Promise<ServerInfo> {
  return api.get<ServerInfo>('/api/lan/server_info', { skipErrorToast: true });
}
