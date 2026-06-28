export interface ApiResponse<T = unknown> {
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
  visibility: number;
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

/** 分享查看者 */
export interface ShareViewer {
  userId: number;
  userName: string;
  viewTime: string;
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

/** 全局上传任务（用于 useTaskStore） */
export interface UploadTaskItem {
  id: string;
  taskId: string;
  fileName: string;
  filePath?: string;
  totalSize: number;
  totalChunk: number;
  finishedChunk: number;
  folderId: number;
  visibility: number;
  status: 'pending' | 'uploading' | 'paused' | 'done' | 'error' | 'skipped';
  progress: number;
  createTime: string;
}

/** 全局下载任务（用于 useTaskStore） */
export interface DownloadTaskItem {
  id: string;
  taskId: string;
  fileId: number;
  fileName: string;
  filePath?: string;
  totalSize: number;
  downloadedSize: number;
  status: 'idle' | 'downloading' | 'paused' | 'done' | 'error';
  progress: number;
  createTime: string;
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
  userName?: string;
  operType: string;
  resourceType?: number;
  resourceId?: number;
  operDesc: string;
  localIp: string;
  createTime: string;
}

// ========== 任务统计 ==========

export interface TaskStatItem {
  count: number;
  totalSize: number;
  avgSpeed: number;
}

export interface TaskStats {
  upload: TaskStatItem;
  download: TaskStatItem;
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
  1: '图片',
  2: '视频',
  3: '音频',
  4: '文档',
  5: '其他',
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
  folderIsPublic?: number;
}

// ========== 公共文件（含上传者） ==========

export interface PublicFile extends FileInfo {
  uploaderName?: string;
}

// ========== 公共文件夹 ==========

export interface PublicFolder {
  id: number;
  parentId: number;
  folderName: string;
  userId: number;
  uploaderName: string;
  children?: PublicFolder[];
}

// ========== 好友 ==========

export interface FriendInfo {
  friendId: number;
  username: string;
  nickname: string;
  avatarUrl?: string;
  createTime: string;
}

export interface FriendRequestInfo {
  id: number;
  fromUserId: number;
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: number;
  toUserName?: string;
  message: string;
  status: number; // 0=待处理, 1=已同意, 2=已拒绝
  createTime: string;
}

export interface SearchUserItem {
  id: number;
  username: string;
  nickname: string;
  avatarUrl?: string;
  isFriend: boolean;
  hasPendingRequest: boolean;
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

// ========== 统一列表项（文件夹+文件合并） ==========

/** FileManager 统一列表项：文件夹或文件 */
export interface ListItem extends FileInfo {
  itemType: 'file' | 'folder';
  folderData?: Folder;
}

/** PublicSpace 统一列表项：公共文件夹或公共文件 */
export interface PublicListItem {
  itemType: 'file' | 'folder';
  id: number;
  name: string;
  fileType: number;
  fileSize: number;
  fileSuffix?: string;
  createTime: string;
  uploaderName?: string;
  mimeType?: string;
  folderData?: PublicFolder;
}
