import client from './client';
import type { ApiResponse, FriendInfo, FriendRequestInfo, SearchUserItem } from '@/types';

/* ========== 搜索用户 ========== */

interface SearchUsersData {
  list: SearchUserItem[];
  total: number;
}

export function searchFriendUsers(q: string): Promise<ApiResponse<SearchUsersData>> {
  return client.get('/api/friend/search', { params: { q } }).then((res) => res.data);
}

/* ========== 发送好友申请 ========== */

interface SendRequestData {
  id: number;
}

export function sendFriendRequest(toUserId: number, message?: string): Promise<ApiResponse<SendRequestData>> {
  return client.post('/api/friend/request', { toUserId, message: message || '' }).then((res) => res.data);
}

/* ========== 好友申请列表 ========== */

interface RequestListData {
  list: FriendRequestInfo[];
  total: number;
}

export function getReceivedRequests(status?: number): Promise<ApiResponse<RequestListData>> {
  return client.get('/api/friend/requests/received', { params: status !== undefined ? { status } : {} }).then((res) => res.data);
}

export function getSentRequests(status?: number): Promise<ApiResponse<RequestListData>> {
  return client.get('/api/friend/requests/sent', { params: status !== undefined ? { status } : {} }).then((res) => res.data);
}

/* ========== 同意/拒绝申请 ========== */

export function acceptRequest(id: number): Promise<ApiResponse> {
  return client.post(`/api/friend/request/${id}/accept`).then((res) => res.data);
}

export function rejectRequest(id: number): Promise<ApiResponse> {
  return client.post(`/api/friend/request/${id}/reject`).then((res) => res.data);
}

/* ========== 好友列表 ========== */

interface FriendListData {
  list: FriendInfo[];
  total: number;
}

export function getFriendList(): Promise<ApiResponse<FriendListData>> {
  return client.get('/api/friend/list').then((res) => res.data);
}

/* ========== 删除好友 ========== */

export function deleteFriend(friendId: number): Promise<ApiResponse> {
  return client.delete(`/api/friend/${friendId}`).then((res) => res.data);
}

/* ========== 检查好友关系 ========== */

interface CheckFriendData {
  isFriend: boolean;
}

export function checkFriend(userId: number): Promise<ApiResponse<CheckFriendData>> {
  return client.get(`/api/friend/check/${userId}`).then((res) => res.data);
}
