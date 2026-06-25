import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Upload,
  Select,
  Button,
  Table,
  Progress,
  message,
  Space,
  Typography,
  Tag,
} from 'antd';
import { InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { uploadInit, uploadChunk, uploadMerge, getTree } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { Folder } from '@/types';

const { Dragger } = Upload;
const { Text } = Typography;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

interface UploadTask {
  uid: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

function UploadPage(): React.ReactNode {
  const [folderTree, setFolderTree] = useState<Folder[]>([]);
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const chunksRef = useRef<Map<string, string>>(new Map()); // fileName -> taskId

  // 加载文件夹树
  const loadFolderTree = async () => {
    try {
      const res = await getTree();
      if (res.data) {
        setFolderTree(res.data);
      }
    } catch {
      // 静默失败
    }
  };

  // 上传单个文件
  const uploadFile = async (file: File) => {
    const task: UploadTask = {
      uid: file.name + Date.now(),
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'pending',
    };

    setUploadTasks((prev) => [...prev, task]);

    try {
      // 1. 初始化上传
      const initRes = await uploadInit({
        fileName: file.name,
        fileSize: file.size,
        md5: 'temp-' + Date.now(), // 简化 MD5 计算
        folderId: targetFolderId,
      });

      if (!initRes.data) {
        throw new Error('初始化上传失败');
      }

      const { taskId, totalChunks } = initRes.data;
      chunksRef.current.set(file.name, taskId);

      // 2. 分片上传
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('taskId', taskId);
        formData.append('chunkIndex', String(i));
        formData.append('file', chunk, file.name);

        await uploadChunk(formData);

        // 更新进度
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.uid === task.uid ? { ...t, progress, status: 'uploading' as const } : t,
          ),
        );
      }

      // 3. 合并分片
      await uploadMerge({
        taskId,
      });

      setUploadTasks((prev) =>
        prev.map((t) =>
          t.uid === task.uid ? { ...t, progress: 100, status: 'done' as const } : t,
        ),
      );
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(`${file.name} 上传失败: ${getErrorMessage(typedErr.response?.data?.code)}`);
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.uid === task.uid ? { ...t, status: 'error' as const } : t,
        ),
      );
    }
  };

  // 自定义上传 — 阻止默认上传行为
  const customRequest = () => {};

  const handleBeforeUpload = (file: File): boolean => {
    if (!targetFolderId) {
      message.warning('请先选择目标文件夹');
      return false;
    }
    uploadFile(file);
    return false; // 阻止默认上传
  };

  // 加载文件夹树
  useEffect(() => {
    loadFolderTree();
  }, []);

  // Select 下拉选项
  const selectOptions = folderTree.map((f) => ({
    value: f.id,
    label: f.folderName,
  }));

  // 上传任务表格
  const columns = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (size: number) => {
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number, record: UploadTask) => (
        <Progress
          percent={progress}
          size="small"
          status={record.status === 'error' ? 'exception' : undefined}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'default', text: '等待中' },
          uploading: { color: 'processing', text: '上传中' },
          done: { color: 'success', text: '已完成' },
          error: { color: 'error', text: '失败' },
        };
        const s = statusMap[status] ?? { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
  ];

  return (
    <Card
      title="上传文件"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadFolderTree}>
            刷新文件夹
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        {/* 目标文件夹选择 */}
        <Space>
          <Text strong>目标文件夹：</Text>
          <Select
            placeholder="请选择文件夹"
            style={{ width: 280 }}
            options={selectOptions}
            value={targetFolderId}
            onChange={(val) => setTargetFolderId(val)}
            allowClear
          />
          {!targetFolderId && (
            <Text type="warning">请先选择目标文件夹后再上传文件</Text>
          )}
        </Space>

        {/* 拖拽上传区域 */}
        <Dragger
          name="file"
          multiple
          customRequest={customRequest}
          beforeUpload={handleBeforeUpload}
          showUploadList={false}
          disabled={!targetFolderId || uploading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持单个或批量上传，文件将通过分片方式上传
          </p>
        </Dragger>

        {/* 上传任务列表 */}
        {uploadTasks.length > 0 && (
          <Table<UploadTask>
            rowKey="uid"
            columns={columns}
            dataSource={uploadTasks}
            pagination={false}
            size="small"
          />
        )}
      </Space>
    </Card>
  );
}

export default UploadPage;
