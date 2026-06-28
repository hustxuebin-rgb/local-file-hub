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
  signal?: AbortSignal;
}

interface PublicListData {
  list: PublicFile[];
  total: number;
}

export function listPublicFiles(params?: PublicListParams): Promise<ApiResponse<PublicListData>> {
  const { signal, ...restParams } = params || {};
  return client.get('/api/file/public', { params: restParams, signal }).then((res) => res.data);
}

/* ========== 公共空间文件夹列表 ========== */

export function listPublicFolders(): Promise<ApiResponse<PublicFolder[]>> {
  return client.get('/api/folder/public').then((res) => res.data);
}
