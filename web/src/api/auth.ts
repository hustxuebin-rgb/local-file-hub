import client from './client';
import type { ApiResponse, LoginReq, LoginResp, User } from '@/types';

/** 登录 */
export function login(data: LoginReq): Promise<ApiResponse<LoginResp>> {
  return client.post('/api/auth/login', data).then((res) => res.data);
}

/** 登出 */
export function logout(): Promise<ApiResponse> {
  return client.post('/api/auth/logout').then((res) => res.data);
}

/** 获取当前用户信息 */
export function getCurrentUser(): Promise<ApiResponse<User>> {
  return client.get('/api/auth/current_user').then((res) => res.data);
}
