import axios from 'axios';
import { message } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';
import { getErrorMessage } from '@/utils/errorCodes';
import type { ApiResponse } from '@/types';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 30000,
});

// 请求拦截器：自动附加 Token
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一错误处理
client.interceptors.response.use(
  (res) => {
    // 后端统一返回 HTTP 200，业务状态码在 data.code 中
    const apiRes = res.data as ApiResponse<unknown> | undefined;
    if (apiRes && apiRes.code !== 200) {
      // 将业务错误转为 rejected promise，由调用方 catch 处理提示
      return Promise.reject({ response: { data: apiRes } });
    }
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }
    const data = error.response?.data as ApiResponse | undefined;
    const code = data?.code;
    const msg = data?.msg;
    message.error(getErrorMessage(code, msg));
    return Promise.reject(error);
  },
);

export default client;
