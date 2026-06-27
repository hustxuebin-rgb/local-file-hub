export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data?: T;
}

export interface User {
  id: number;
  username: string;
  nickname: string;
  role: number;
  storageRoot: string;
  storageQuota: number;
  usedSize: number;
  avatarUrl?: string;
  diskId?: number;
  status: number;
  createTime: string;
}

export interface LoginReq {
  username: string;
  password: string;
  deviceType: number;
  deviceName?: string;
}

export interface LoginResp {
  token: string;
  user: User;
  deviceId: number;
}

export interface Folder {
  id: number;
  userId?: number;
  parentId: number;
  folderName: string;
  fullPath?: string;
  isPublic?: number;
  sort?: number;
  createTime?: string;
  children?: Folder[];
}

export interface FileInfo {
  id: number;
  userId: number;
  folderId: number;
  fileName: string;
  saveName: string;
  fileSuffix: string;
  fileType: number;
  fileSize: number;
  mimeType?: string;
  md5: string;
  fullPath: string;
  thumbnailPath?: string;
  sourceDevice?: number;
  isDelete: number;
  deleteTime?: string;
  createTime: string;
}

export interface ShareRecord {
  id: number;
  shareType: number;
  resourceId: number;
  shareUserId: number;
  receiveUserId: number;
  sharePerm: number;
  expireType: number;
  expireTime?: string;
  status: number;
  createTime: string;
  updateTime: string;
  shareUserName?: string;
  receiveUserName?: string;
  resourceName?: string;
}

export interface UploadTask {
  id: number;
  taskId: string;
  fileName: string;
  totalSize: number;
  totalChunk: number;
  finishedChunk: number;
  status: number;
}

export interface DiskInfo {
  id: number;
  diskType: number;
  diskPath: string;
  totalSize: number;
  usedSize: number;
  availableSize: number;
  status: number;
  remark?: string;
}

export interface SyncTask {
  id: number;
  syncMode: number;
  cronExpr: string;
  ignoreSuffix?: string;
  speedLimit?: number;
  lastSyncTime?: string;
  lastSyncResult?: number;
  isRunning: number;
}

export interface WarnLog {
  id: number;
  warnType: number;
  warnContent: string;
  isRead: number;
  createTime: string;
}

export interface OperationLog {
  id: number;
  userId?: number;
  operType: string;
  resourceType?: number;
  resourceId?: number;
  operDesc: string;
  localIp: string;
  createTime: string;
}

export interface MountInfo {
  mountPoint: string;
  device: string;
  fsType: string;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DiskSimple {
  id: number;
  diskPath: string;
  diskType: number;
}

export const FILE_TYPE_MAP: Record<number, string> = {
  0: '其他',
  1: '图片',
  2: '视频',
  3: '音频',
  4: '文档',
};

export const PERMISSION_MAP: Record<number, string> = {
  1: '只读',
  2: '可上传',
};

export const DEVICE_TYPE_MAP: Record<number, string> = {
  1: 'Web浏览器',
  2: '微信小程序',
};

// ========== 收藏 ==========

export interface Favorite {
  id: number;
  targetType: number; // 1=文件, 2=文件夹, 3=分享
  targetId: number;
  targetName: string;
  targetSize: number;
  ownerName: string;
  createTime: string;
}

// ========== 公共文件（含上传者） ==========

export interface PublicFile extends FileInfo {
  uploaderName?: string;
}

// ========== 视图模式 ==========

export type ViewMode = 'list' | 'grid';

// ========== 排序选项 ==========

export interface SortOption {
  field: 'name' | 'fileSize' | 'fileType' | 'createTime';
  order: 'asc' | 'desc';
}

// ========== 文件分类 ==========

export interface FileCategory {
  key: string;
  label: string;
  fileType?: number;
}
