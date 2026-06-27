import client from './client';
import type { ApiResponse, Favorite } from '@/types';

/* ========== 收藏列表 ========== */

interface FavoriteListData {
  list: Favorite[];
  total: number;
}

export function listFavorites(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  targetType?: number; // 1=文件, 2=文件夹, 3=分享
  sortBy?: string;     // targetName, createTime, targetSize
  sortOrder?: string;  // asc, desc
}): Promise<ApiResponse<FavoriteListData>> {
  return client.get('/api/favorite/list', { params }).then((res) => res.data);
}

/* ========== 添加/取消收藏 ========== */

interface FavoriteReq {
  targetType: number; // 1=文件, 2=文件夹, 3=分享
  targetId: number;
}

export function addFavorite(data: FavoriteReq): Promise<ApiResponse> {
  return client.post('/api/favorite', data).then((res) => res.data);
}

export function removeFavorite(data: FavoriteReq): Promise<ApiResponse> {
  return client.delete('/api/favorite', { data }).then((res) => res.data);
}
