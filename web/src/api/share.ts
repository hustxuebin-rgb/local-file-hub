import client from './client';
import type { ApiResponse, ShareRecord, ShareViewer } from '@/types';

/* ========== 创建分享 ========== */

interface CreateShareReq {
  resourceId: number;
  shareType: number;
  receiveUserId: number;
  sharePerm: number;
  expireType: number;
}

export function createShare(data: CreateShareReq): Promise<ApiResponse> {
  return client.post('/api/share', data).then((res) => res.data);
}

/* ========== 查询分享 ========== */

interface ShareListData {
  list: ShareRecord[];
  total: number;
}

export function getMyShares(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<ShareListData>> {
  return client.get('/api/share/my', { params }).then((res) => res.data);
}

export function getReceivedShares(params: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<ShareListData>> {
  return client.get('/api/share/received', { params }).then((res) => res.data);
}

export function getShareContents(id: number): Promise<ApiResponse> {
  return client.get(`/api/share/${id}/contents`).then((res) => res.data);
}

/* ========== 更新/取消分享 ========== */

interface UpdateShareReq {
  sharePerm: number;
  expireType: number;
  expireTime?: string;
}

export function updateShare(id: number, data: UpdateShareReq): Promise<ApiResponse> {
  return client.put(`/api/share/${id}`, data).then((res) => res.data);
}

export function cancelShare(id: number): Promise<ApiResponse> {
  return client.delete(`/api/share/${id}`).then((res) => res.data);
}

/* ========== 分享查看者 ========== */

interface ShareViewerListData {
  list: ShareViewer[];
  total: number;
}

export function getShareViewers(id: number): Promise<ApiResponse<ShareViewerListData>> {
  return client.get(`/api/share/${id}/viewers`).then((res) => res.data);
}

/* ========== 批量分享 ========== */

interface BatchShareItem {
  resourceId: number;
  shareType: number;
  receiveUserId: number;
  sharePerm: number;
  expireType: number;
}

interface BatchShareReq {
  items: BatchShareItem[];
}

export function batchCreateShare(data: BatchShareReq): Promise<ApiResponse> {
  return client.post('/api/share/batch', data).then((res) => res.data);
}
