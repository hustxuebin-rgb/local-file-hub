// Mock @tarojs/taro for Node test environment
const storage = new Map();

module.exports = {
  __esModule: true,
  default: {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => { storage.set(key, value); },
    removeStorageSync: (key) => { storage.delete(key); },
    // mock other Taro APIs as needed
  },
  // named exports
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => { storage.set(key, value); },
  removeStorageSync: (key) => { storage.delete(key); },
};
