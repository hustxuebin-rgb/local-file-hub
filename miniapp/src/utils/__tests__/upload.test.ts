/**
 * upload.ts 单元测试
 *
 * 由于 chunkedUpload 依赖 Taro 原生 API（request/uploadFile/getFileSystemManager），
 * 测试采用 Mock 方式覆盖核心流程：正常上传、初始化失败、合并失败、暂停信号、进度回调。
 */

// ---- Mock @tarojs/taro ----
const mockRequest = jest.fn();
const mockUploadFile = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    request: mockRequest,
    uploadFile: mockUploadFile,
    getFileSystemManager: () => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      unlink: mockUnlink,
    }),
    env: {
      USER_DATA_PATH: '/mock/user/data',
    },
  },
}));

// ---- Mock config ----
jest.mock('../config', () => ({
  __esModule: true,
  getApiBaseUrl: () => 'http://test-server.local:8080',
  STORAGE_KEYS: { TOKEN: 'token' },
}));

import { chunkedUpload, ChunkUploadConfig } from '../upload';

const BASE_CONFIG: ChunkUploadConfig = {
  filePath: '/tmp/test-video.mp4',
  fileName: 'test-video.mp4',
  fileSize: 15 * 1024 * 1024, // 15MB
  token: 'test-token-123',
};

const INIT_RESPONSE = {
  data: {
    code: 200,
    data: {
      taskId: 'task-abc-123',
      chunkSize: 2 * 1024 * 1024, // 2MB per chunk
      totalChunks: 8,
    },
  },
};

const CHUNK_RESPONSE = {
  data: JSON.stringify({ code: 200, msg: 'ok' }),
  statusCode: 200,
};

const MERGE_RESPONSE = {
  data: { code: 200, msg: 'ok' },
};

function setupMocks(): void {
  mockRequest.mockReset();
  mockUploadFile.mockReset();
  mockReadFile.mockReset();
  mockWriteFile.mockReset();
  mockUnlink.mockReset();

  // 读文件：返回模拟 ArrayBuffer
  mockReadFile.mockImplementation((opts: { success: (res: { data: ArrayBuffer }) => void }) => {
    opts.success({ data: new ArrayBuffer(8) });
  });

  // 写临时文件成功
  mockWriteFile.mockImplementation((opts: { success: () => void }) => {
    opts.success();
  });
}

describe('chunkedUpload', () => {
  beforeEach(() => {
    setupMocks();
  });

  // ====== 正常路径 ======
  describe('正常上传流程', () => {
    it('应依次调用 init → chunk × N → merge', async () => {
      mockRequest
        .mockResolvedValueOnce(INIT_RESPONSE) // init
        .mockResolvedValueOnce(MERGE_RESPONSE); // merge
      mockUploadFile.mockResolvedValue(CHUNK_RESPONSE);

      await chunkedUpload(BASE_CONFIG);

      // 验证 init 调用
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
        url: 'http://test-server.local:8080/api/file/upload/init',
        method: 'POST',
        data: { fileName: 'test-video.mp4', fileSize: 15728640 },
      }));

      // 验证 8 个分片上传
      expect(mockUploadFile).toHaveBeenCalledTimes(8);
      for (let i = 0; i < 8; i++) {
        expect(mockUploadFile).toHaveBeenNthCalledWith(i + 1, expect.objectContaining({
          url: 'http://test-server.local:8080/api/file/upload/chunk',
          filePath: `/mock/user/data/upload_chunk_task-abc-123_${i}`,
          name: 'file',
          formData: { taskId: 'task-abc-123', chunkIndex: String(i) },
        }));
      }

      // 验证 merge 调用
      expect(mockRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
        url: 'http://test-server.local:8080/api/file/upload/merge',
        method: 'POST',
        data: { taskId: 'task-abc-123' },
      }));

      // 验证临时文件清理
      expect(mockUnlink).toHaveBeenCalledTimes(8);
    });
  });

  // ====== 进度回调 ======
  describe('进度回调', () => {
    it('应在每个分片完成后调用 onProgress', async () => {
      mockRequest
        .mockResolvedValueOnce(INIT_RESPONSE)
        .mockResolvedValueOnce(MERGE_RESPONSE);
      mockUploadFile.mockResolvedValue(CHUNK_RESPONSE);

      const onProgress = jest.fn();

      await chunkedUpload({ ...BASE_CONFIG, onProgress });

      expect(onProgress).toHaveBeenCalledTimes(8);
      // 第一个分片完成：1/8 ≈ 13%
      expect(onProgress).toHaveBeenNthCalledWith(1, 13, 1, 8);
      // 最后一个分片完成：8/8 = 100%
      expect(onProgress).toHaveBeenNthCalledWith(8, 100, 8, 8);
    });
  });

  // ====== 边界条件 ======
  describe('边界条件', () => {
    it('应处理只有一个分片的文件', async () => {
      const initResp = {
        data: {
          code: 200,
          data: { taskId: 'task-single', chunkSize: 10485760, totalChunks: 1 },
        },
      };
      mockRequest
        .mockResolvedValueOnce(initResp)
        .mockResolvedValueOnce(MERGE_RESPONSE);
      mockUploadFile.mockResolvedValue(CHUNK_RESPONSE);

      await chunkedUpload(BASE_CONFIG);

      expect(mockUploadFile).toHaveBeenCalledTimes(1);
    });

    it('应处理返回 code 为 0 的响应', async () => {
      mockRequest
        .mockResolvedValueOnce({
          data: { code: 0, data: { taskId: 't-zero', chunkSize: 5242880, totalChunks: 3 } },
        })
        .mockResolvedValueOnce({ data: { code: 0 } });
      mockUploadFile.mockResolvedValue({ data: JSON.stringify({ code: 0 }), statusCode: 200 });

      await chunkedUpload(BASE_CONFIG);
      // 不抛异常即通过
    });
  });

  // ====== 异常路径 ======
  describe('异常路径', () => {
    it('init 失败时应抛出错误', async () => {
      mockRequest.mockResolvedValueOnce({
        data: { code: 500, msg: '服务端内部错误' },
      });

      await expect(chunkedUpload(BASE_CONFIG)).rejects.toThrow('服务端内部错误');
    });

    it('init 响应缺少 data 时应抛出错误', async () => {
      mockRequest.mockResolvedValueOnce({
        data: { code: 200 },
      });

      await expect(chunkedUpload(BASE_CONFIG)).rejects.toThrow('初始化上传响应异常');
    });

    it('merge 失败时应抛出错误', async () => {
      mockRequest
        .mockResolvedValueOnce(INIT_RESPONSE)
        .mockResolvedValueOnce({ data: { code: 500, msg: '合并失败' } });
      mockUploadFile.mockResolvedValue(CHUNK_RESPONSE);

      await expect(chunkedUpload(BASE_CONFIG)).rejects.toThrow('合并失败');
    });

    it('网络请求失败时应抛出错误', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network error'));

      await expect(chunkedUpload(BASE_CONFIG)).rejects.toThrow('Network error');
    });
  });

  // ====== 暂停信号 ======
  describe('暂停信号', () => {
    it('signal.aborted 为 true 时应在分片循环中抛出 UPLOAD_PAUSED', async () => {
      mockRequest
        .mockResolvedValueOnce(INIT_RESPONSE)
        .mockResolvedValueOnce(MERGE_RESPONSE);
      mockUploadFile.mockResolvedValue(CHUNK_RESPONSE);

      const signal = { aborted: false };

      // 在第 3 个分片完成后设置暂停
      let callCount = 0;
      mockUploadFile.mockImplementation(async () => {
        callCount++;
        if (callCount === 3) {
          signal.aborted = true;
        }
        return CHUNK_RESPONSE;
      });

      await expect(chunkedUpload({ ...BASE_CONFIG, signal })).rejects.toThrow('UPLOAD_PAUSED');
      // 应该完成了 3 个分片
      expect(callCount).toBe(3);
    });
  });

  // ====== 类型导出 ======
  describe('类型导出', () => {
    it('ChunkUploadConfig 接口应可被导入使用', () => {
      const cfg: ChunkUploadConfig = {
        filePath: '/tmp/test.mp4',
        fileName: 'test.mp4',
        fileSize: 100,
        token: 't',
        onProgress: () => {},
        signal: { aborted: false },
      };
      expect(cfg.filePath).toBe('/tmp/test.mp4');
      expect(cfg.signal?.aborted).toBe(false);
    });
  });
});
