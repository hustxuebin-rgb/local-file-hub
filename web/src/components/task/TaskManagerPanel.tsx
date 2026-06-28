import React, { useMemo } from 'react';
import { Drawer, Tabs, Table, Progress, Tag, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PauseCircleOutlined, PlayCircleOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTaskStore } from '@/stores/useTaskStore';
import type { UploadTaskItem, DownloadTaskItem } from '@/types';

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const statusLabelMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '等待中' },
  uploading: { color: 'processing', text: '上传中' },
  downloading: { color: 'processing', text: '下载中' },
  paused: { color: 'warning', text: '已暂停' },
  done: { color: 'success', text: '已完成' },
  error: { color: 'error', text: '失败' },
  skipped: { color: 'warning', text: '已跳过' },
  idle: { color: 'default', text: '空闲' },
};

function TaskManagerPanel(): React.ReactNode {
  const panelVisible = useTaskStore((s) => s.panelVisible);
  const togglePanel = useTaskStore((s) => s.togglePanel);
  const activeTab = useTaskStore((s) => s.activeTab);
  const setActiveTab = useTaskStore((s) => s.setActiveTab);
  const uploadTasks = useTaskStore((s) => s.uploadTasks);
  const downloadTasks = useTaskStore((s) => s.downloadTasks);
  const callbacks = useTaskStore((s) => s.callbacks);
  const removeUploadTask = useTaskStore((s) => s.removeUploadTask);
  const removeDownloadTask = useTaskStore((s) => s.removeDownloadTask);

  const uploadActiveCount = useMemo(
    () => uploadTasks.filter((t) => t.status === 'pending' || t.status === 'uploading' || t.status === 'paused').length,
    [uploadTasks],
  );

  const downloadActiveCount = useMemo(
    () => downloadTasks.filter((t) => t.status === 'downloading' || t.status === 'paused').length,
    [downloadTasks],
  );

  const uploadColumns: ColumnsType<UploadTaskItem> = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 140,
    },
    {
      title: '大小',
      dataIndex: 'totalSize',
      key: 'totalSize',
      width: 80,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 130,
      render: (progress: number, record: UploadTaskItem) => {
        let strokeColor: string | undefined;
        if (record.status === 'error') strokeColor = undefined;
        else if (record.status === 'paused') strokeColor = '#fa8c16';
        return (
          <Progress
            percent={progress}
            size="small"
            status={record.status === 'error' ? 'exception' : undefined}
            strokeColor={strokeColor}
          />
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (status: string) => {
        const s = statusLabelMap[status] ?? { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: UploadTaskItem) => (
        <Space size="small">
          {record.status === 'uploading' && (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => callbacks.onPauseUpload?.(record)}
            />
          )}
          {(record.status === 'paused' || record.status === 'error') && (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => callbacks.onResumeUpload?.(record)}
            />
          )}
          {record.status !== 'done' && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => callbacks.onCancelUpload?.(record)}
            />
          )}
          {record.status === 'done' && (
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => removeUploadTask(record.id)}
            />
          )}
        </Space>
      ),
    },
  ];

  const downloadColumns: ColumnsType<DownloadTaskItem> = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 140,
    },
    {
      title: '大小',
      dataIndex: 'totalSize',
      key: 'totalSize',
      width: 80,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 130,
      render: (progress: number, record: DownloadTaskItem) => {
        let strokeColor: string | undefined;
        if (record.status === 'error') strokeColor = undefined;
        else if (record.status === 'paused') strokeColor = '#fa8c16';
        return (
          <Progress
            percent={progress}
            size="small"
            status={record.status === 'error' ? 'exception' : undefined}
            strokeColor={strokeColor}
          />
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (status: string) => {
        const s = statusLabelMap[status] ?? { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: DownloadTaskItem) => (
        <Space size="small">
          {record.status === 'downloading' && (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => callbacks.onPauseDownload?.(record)}
            />
          )}
          {record.status === 'paused' && (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => callbacks.onResumeDownload?.(record)}
            />
          )}
          {record.status !== 'done' && record.status !== 'error' && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => callbacks.onCancelDownload?.(record)}
            />
          )}
          {(record.status === 'done' || record.status === 'error') && (
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => removeDownloadTask(record.id)}
            />
          )}
        </Space>
      ),
    },
  ];

  const handleClearCompleted = () => {
    uploadTasks
      .filter((t) => t.status === 'done' || t.status === 'skipped')
      .forEach((t) => removeUploadTask(t.id));
    downloadTasks
      .filter((t) => t.status === 'done')
      .forEach((t) => removeDownloadTask(t.id));
  };

  return (
    <Drawer
      title="任务管理"
      placement="right"
      size="large"
      open={panelVisible}
      onClose={() => togglePanel(false)}
      extra={
        <Space>
          <Button size="small" onClick={() => {
            uploadTasks
              .filter((t) => t.status === 'uploading')
              .forEach((t) => callbacks.onPauseUpload?.(t));
            downloadTasks
              .filter((t) => t.status === 'downloading')
              .forEach((t) => callbacks.onPauseDownload?.(t));
          }}>
            全部暂停
          </Button>
          <Button size="small" type="primary" onClick={() => {
            uploadTasks
              .filter((t) => t.status === 'paused')
              .forEach((t) => callbacks.onResumeUpload?.(t));
            downloadTasks
              .filter((t) => t.status === 'paused')
              .forEach((t) => callbacks.onResumeDownload?.(t));
          }}>
            全部恢复
          </Button>
          <Button size="small" onClick={handleClearCompleted}>
            清除已完成
          </Button>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'upload' | 'download')}
        items={[
          {
            key: 'upload',
            label: `上传 (${uploadActiveCount})`,
            children: (
              <Table<UploadTaskItem>
                rowKey="id"
                columns={uploadColumns}
                dataSource={uploadTasks}
                pagination={false}
                size="small"
                locale={{ emptyText: '暂无上传任务' }}
              />
            ),
          },
          {
            key: 'download',
            label: `下载 (${downloadActiveCount})`,
            children: (
              <Table<DownloadTaskItem>
                rowKey="id"
                columns={downloadColumns}
                dataSource={downloadTasks}
                pagination={false}
                size="small"
                locale={{ emptyText: '暂无下载任务' }}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}

export default TaskManagerPanel;
