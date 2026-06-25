import { getApiBaseUrl, STORAGE_KEYS } from '../config';

describe('config', () => {
  it('getApiBaseUrl 应该返回字符串', () => {
    expect(typeof getApiBaseUrl()).toBe('string');
  });

  it('STORAGE_KEYS 应该包含 TOKEN', () => {
    expect(STORAGE_KEYS.TOKEN).toBe('token');
  });

  it('STORAGE_KEYS 应该包含 USER_INFO', () => {
    expect(STORAGE_KEYS.USER_INFO).toBe('userInfo');
  });

  it('STORAGE_KEYS 应该包含 DEVICE_ID', () => {
    expect(STORAGE_KEYS.DEVICE_ID).toBe('deviceId');
  });
});
