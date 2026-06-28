import Taro from '@tarojs/taro';
import { getApiBaseUrl } from './config';

/**
 * 分片上传配置
 */
export interface ChunkUploadConfig {
  /** 文件临时路径 (wxfile:// 或 http://tmp/) */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 认证 Token */
  token: string;
  /** 进度回调 */
  onProgress?: (percent: number, currentChunk: number, totalChunks: number) => void;
  /** 暂停信号：当 aborted 为 true 时中止上传 */
  signal?: { aborted: boolean };
}

/**
 * 初始化上传接口响应
 */
interface UploadInitResponse {
  taskId: string;
  chunkSize: number;
  totalChunks: number;
}

/**
 * API 统一响应格式
 */
interface ApiResponse<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

/**
 * 读取文件的指定片段为 ArrayBuffer
 */
function readFileChunk(filePath: string, position: number, length: number): Promise<ArrayBuffer> {
  const fs = Taro.getFileSystemManager();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    fs.readFile({
      filePath,
      position,
      length,
      success: (res) => {
        resolve(res.data as ArrayBuffer);
      },
      fail: (err) => {
        reject(new Error(`读取文件片段失败: ${err.errMsg}`));
      },
    });
  });
}

/**
 * 将 ArrayBuffer 写入临时文件并返回临时文件路径
 */
function writeTempFile(taskId: string, chunkIndex: number, data: ArrayBuffer): Promise<string> {
  const fs = Taro.getFileSystemManager();
  const tempFilePath = `${Taro.env.USER_DATA_PATH}/upload_chunk_${taskId}_${chunkIndex}`;
  return new Promise<string>((resolve, reject) => {
    fs.writeFile({
      filePath: tempFilePath,
      data,
      success: () => resolve(tempFilePath),
      fail: (err) => {
        reject(new Error(`写入临时文件失败: ${err.errMsg}`));
      },
    });
  });
}

/**
 * 安全删除临时文件（失败不抛异常）
 */
function removeTempFile(filePath: string): void {
  try {
    const fs = Taro.getFileSystemManager();
    fs.unlink({ filePath });
  } catch {
    // 清理失败不阻塞流程
  }
}

/**
 * 分片上传完整流程：
 *   1. 调用 POST /api/file/upload/init 初始化
 *   2. 循环读取文件片段并上传每个分片
 *   3. 调用 POST /api/file/upload/merge 合并分片
 *
 * @param config - 分片上传配置
 * @returns Promise<void>
 */
export async function chunkedUpload(config: ChunkUploadConfig): Promise<void> {
  const { filePath, fileName, fileSize, token, onProgress, signal } = config;
  const baseUrl = getApiBaseUrl();

  // ---- Step 1: 初始化上传 ----
  const initRes = await Taro.request({
    url: `${baseUrl}/api/file/upload/init`,
    method: 'POST',
    data: { fileName, fileSize },
    header: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });

  const initBody = initRes.data as ApiResponse<UploadInitResponse>;
  if (initBody.code !== 200 && initBody.code !== 0) {
    throw new Error(initBody.msg || '初始化上传失败');
  }
  if (!initBody.data) {
    throw new Error('初始化上传响应异常');
  }

  const { taskId, chunkSize, totalChunks } = initBody.data;

  // ---- Step 2: 循环上传分片 ----
  for (let i = 0; i < totalChunks; i++) {
    // 检查暂停信号
    if (signal?.aborted) {
      throw new Error('UPLOAD_PAUSED');
    }

    const offset = i * chunkSize;
    const currentChunkSize = Math.min(chunkSize, fileSize - offset);

    // 读取文件片段
    const chunkData = await readFileChunk(filePath, offset, currentChunkSize);

    // 写入临时文件
    const tempFilePath = await writeTempFile(taskId, i, chunkData);

    try {
      // 上传分片
      const chunkRes = await Taro.uploadFile({
        url: `${baseUrl}/api/file/upload/chunk`,
        filePath: tempFilePath,
        name: 'file',
        formData: {
          taskId,
          chunkIndex: String(i),
        },
        header: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 60000,
      });

      const chunkBody = JSON.parse(chunkRes.data) as ApiResponse;
      if (chunkBody.code !== 200 && chunkBody.code !== 0) {
        throw new Error(chunkBody.msg || `分片 ${i} 上传失败`);
      }
    } finally {
      // 清理临时文件
      removeTempFile(tempFilePath);
    }

    // 进度回调
    const percent = Math.round(((i + 1) / totalChunks) * 100);
    onProgress?.(percent, i + 1, totalChunks);
  }

  // ---- Step 3: 合并分片 ----
  const mergeRes = await Taro.request({
    url: `${baseUrl}/api/file/upload/merge`,
    method: 'POST',
    data: { taskId },
    header: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 30000,
  });

  const mergeBody = mergeRes.data as ApiResponse;
  if (mergeBody.code !== 200 && mergeBody.code !== 0) {
    throw new Error(mergeBody.msg || '合并分片失败');
  }
}

export { getApiBaseUrl };
