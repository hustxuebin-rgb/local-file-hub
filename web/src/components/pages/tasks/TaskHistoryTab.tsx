import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Tag, Input, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { tasksHistory } from '@/api/file';
import type { UnifiedTaskItem } from '@/api/file';
import { formatFileSize } from '@/utils/format';

const TASK_STATUS_MAP: Record<number, { color: string; text: string }> = {
  0: { color: 'default', text: '等待中' },
  1: { color: 'processing', text: '进行中' },
  2: { color: 'warning', text: '已暂停' },
  3: { color: 'success', text: '已完成' },
  4: { color: 'error', text: '失败' },
  5: { color: 'default', text: '已取消' },
};

const TASK_TYPE_MAP: Record<string, string> = {
  upload: '上传',
  download: '下载',
};

interface TaskHistoryTabProps {
  type?: string;
}

function TaskHistoryTab({ type }: TaskHistoryTabProps): React.ReactNode {
  const [data, setData] = useState<UnifiedTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHistory = useCallback(
    async (p: number, ps: number, kw: string, st: string) => {
      setLoading(true);
      try {
        const res = await tasksHistory({
          type,
          status: st || undefined,
          keyword: kw || undefined,
          page: p,
          pageSize: ps,
        });
        if (res.data) {
          setData(res.data.items);
          setTotal(res.data.total);
        }
      } catch {
        // 错误已在 client 拦截器中处理
      } finally {
        setLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    fetchHistory(page, pageSize, keyword, statusFilter);
  }, [page, pageSize, statusFilter, fetchHistory]);

  // keyword 变化时防抖
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchHistory(1, pageSize, keyword, statusFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<UnifiedTaskItem> = [
    {
      title: '类型',
      dataIndex: 'taskType',
      key: 'taskType',
      width: 70,
      render: (t: string) => TASK_TYPE_MAP[t] ?? t,
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 200,
    },
    {
      title: '大小',
      dataIndex: 'totalSize',
      key: 'totalSize',
      width: 90,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 100,
      render: (p: number) => `${Math.round(p)}%`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: number) => {
        const s = TASK_STATUS_MAP[status] ?? { color: 'default', text: String(status) };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (t: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('zh-CN');
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索文件名"
          prefix={<SearchOutlined />}
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 120 }}
          value={statusFilter || undefined}
          onChange={(val) => {
            setStatusFilter(val ?? '');
            setPage(1);
          }}
          options={[
            { label: '全部', value: '' },
            { label: '已完成', value: '3' },
            { label: '失败', value: '4' },
            { label: '已取消', value: '5' },
          ]}
        />
      </Space>
      <Table<UnifiedTaskItem>
        rowKey="taskId"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        size="small"
        locale={{ emptyText: '暂无历史记录' }}
      />
    </div>
  );
}

export default TaskHistoryTab;
