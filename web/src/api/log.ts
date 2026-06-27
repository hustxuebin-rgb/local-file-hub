import client from './client';
import type { ApiResponse, OperationLog } from '@/types';

/* ========== 操作记录 ========== */

interface MyLogListData {
  list: OperationLog[];
  total: number;
}

export function getMyLogs(params: {
  operType?: string;
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<MyLogListData>> {
  return client.get('/api/log/my', { params }).then((res) => res.data);
}
