import Taro from '@tarojs/taro';
import { getApiBaseUrl, STORAGE_KEYS } from './config';

interface RequestConfig {
  skipAuth?: boolean;
  skipErrorToast?: boolean;
  timeout?: number;
  contentType?: string;
  params?: Record<string, unknown>;
}

interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<T> {
  const token = config?.skipAuth ? undefined : Taro.getStorageSync(STORAGE_KEYS.TOKEN);

  const header: Record<string, string> = {
    'Content-Type': config?.contentType || 'application/json',
  };

  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await Taro.request({
      url: `${getApiBaseUrl()}${url}`,
      method,
      data: method === 'GET' ? config?.params : data,
      header,
      timeout: config?.timeout || 30000,
    });

    const body = res.data as ApiResponse<T>;

    if (res.statusCode === 401) {
      Taro.removeStorageSync(STORAGE_KEYS.TOKEN);
      Taro.removeStorageSync(STORAGE_KEYS.USER_INFO);
      Taro.reLaunch({ url: '/pages/login/index' });
      throw new Error('登录已过期，请重新登录');
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (body.code === 0 || body.code === 200) {
        return body.data as T;
      }
      if (!config?.skipErrorToast) {
        Taro.showToast({ title: body.msg || '请求失败', icon: 'none' });
      }
      throw new Error(body.msg || '请求失败');
    }

    if (!config?.skipErrorToast) {
      Taro.showToast({ title: body.msg || '请求失败', icon: 'none' });
    }
    throw new Error(body.msg || '请求失败');
  } catch (err) {
    if (err instanceof Error && err.message === '登录已过期，请重新登录') {
      throw err;
    }
    if (err instanceof Taro.NetworkError || (err as { errMsg?: string })?.errMsg?.includes('timeout')) {
      if (!config?.skipErrorToast) {
        Taro.showToast({ title: '无法连接服务器', icon: 'none', duration: 4000 });
      }
    }
    throw err;
  }
}

export const api = {
  get: <T>(url: string, config?: RequestConfig) => request<T>('GET', url, undefined, config),
  post: <T>(url: string, data?: unknown, config?: RequestConfig) => request<T>('POST', url, data, config),
  put: <T>(url: string, data?: unknown, config?: RequestConfig) => request<T>('PUT', url, data, config),
  delete: <T>(url: string, config?: RequestConfig) => request<T>('DELETE', url, undefined, config),
};

export default api;
