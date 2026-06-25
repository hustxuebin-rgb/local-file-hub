// 局域网访问：从本地存储读取服务器地址，未配置时使用 localhost
// 后端启动时会打印局域网IP，在小程序登录页输入一次即可持久化

import Taro from '@tarojs/taro';

const DEFAULT_URL = 'http://local-file-hub.local:8080';

export function getApiBaseUrl(): string {
  if (typeof Taro !== 'undefined') {
    const saved = Taro.getStorageSync('server_url');
    if (saved) return saved;
  }
  return DEFAULT_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof Taro !== 'undefined') {
    Taro.setStorageSync('server_url', url);
  }
}

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'userInfo',
  DEVICE_ID: 'deviceId',
  SERVER_URL: 'server_url',
};
