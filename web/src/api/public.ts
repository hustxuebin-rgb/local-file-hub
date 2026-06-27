import client from './client';
import type { ApiResponse, PublicFile, PublicFolder } from '@/types';

/* ========== 公共空间文件列表 ========== */

interface PublicListParams {
  keyword?: string;
  fileType?: number;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
  folderId?: number;
}

interface PublicListData {
  list: PublicFile[];
  total: number;
}

export function listPublicFiles(params?: PublicListParams): Promise<ApiResponse<PublicListData>> {
  return client.get('/api/file/public', { params }).then((res) => res.data);
}

/* ========== 公共空间文件夹列表 ========== */

export function listPublicFolders(): Promise<ApiResponse<PublicFolder[]>> {
  return client.get('/api/folder/public').then((res) => res.data);
}
