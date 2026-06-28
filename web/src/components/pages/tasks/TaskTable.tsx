import { Table, Progress, Tag, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PauseCircleOutlined, PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
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

interface TaskTableProps {
  tasks: UnifiedTaskItem[];
  loading: boolean;
  selectedTaskIds: string[];
  onSelectChange: (ids: string[]) => void;
  onPause?: (task: UnifiedTaskItem) => void;
  onResume?: (task: UnifiedTaskItem) => void;
  onCancel?: (task: UnifiedTaskItem) => void;
}

function TaskTable({
  tasks,
  loading,
  selectedTaskIds,
  onSelectChange,
  onPause,
  onResume,
  onCancel,
}: TaskTableProps): React.ReactNode {
  const columns: ColumnsType<UnifiedTaskItem> = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 180,
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
      width: 150,
      render: (progress: number, record: UnifiedTaskItem) => {
        let strokeColor: string | undefined;
        if (record.status === 4) strokeColor = undefined;
        else if (record.status === 2) strokeColor = '#fa8c16';
        return (
          <Progress
            percent={Math.round(progress)}
            size="small"
            status={record.status === 4 ? 'exception' : undefined}
            strokeColor={strokeColor}
          />
        );
      },
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
      width: 140,
      render: (t: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: UnifiedTaskItem) => (
        <Space size="small">
          {record.status === 1 && (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => onPause?.(record)}
            />
          )}
          {record.status === 2 && (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => onResume?.(record)}
            />
          )}
          {record.status !== 3 && record.status !== 5 && (
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => onCancel?.(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table<UnifiedTaskItem>
      rowKey="taskId"
      columns={columns}
      dataSource={tasks}
      loading={loading}
      pagination={false}
      size="small"
      locale={{ emptyText: '暂无活跃任务' }}
      rowSelection={{
        selectedRowKeys: selectedTaskIds,
        onChange: (keys) => onSelectChange(keys as string[]),
      }}
    />
  );
}

export default TaskTable;
