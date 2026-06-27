import client from './client';
import type { ApiResponse, PublicFile } from '@/types';

/* ========== 公共空间文件列表 ========== */

interface PublicListParams {
  keyword?: string;
  fileType?: number;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

interface PublicListData {
  list: PublicFile[];
  total: number;
}

export function listPublicFiles(params?: PublicListParams): Promise<ApiResponse<PublicListData>> {
  return client.get('/api/file/public', { params }).then((res) => res.data);
}
