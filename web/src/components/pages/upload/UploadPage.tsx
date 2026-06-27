import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  Upload,
  TreeSelect,
  Button,
  Table,
  Progress,
  message,
  Space,
  Typography,
  Tag,
  Modal,
  Alert,
  Input,
  Switch,
  Segmented,
} from 'antd';
import { InboxOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { uploadInit, uploadChunk, uploadMerge, uploadCancel, getTree, createFolder } from '@/api';
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
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped';
}

interface ConflictInfo {
  fileName: string;
  conflictFileId: number;
}

function UploadPage(): React.ReactNode {
  const [partition, setPartition] = useState<number>(0);
  const [folderTree, setFolderTree] = useState<Folder[]>([]);
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);
  const [conflictModal, setConflictModal] = useState<ConflictInfo | null>(null);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderSubmitting, setCreateFolderSubmitting] = useState(false);
  const [newFolderIsPublic, setNewFolderIsPublic] = useState(0);
  const chunksRef = useRef<Map<string, string>>(new Map());
  // 冲突弹窗队列：并发场景下多个文件同时冲突时排队处理
  const conflictQueueRef = useRef<Array<{
    fileName: string;
    conflictFileId: number;
    resolve: (choice: 'replace' | 'keepBoth' | 'cancel') => void;
  }>>([]);
  // 使用 ref 跟踪总数，避免并发场景下的闭包陷阱
  const totalRef = useRef(0);

  const loadFolderTree = async (p?: number) => {
    try {
      const isPublic = p !== undefined ? p : partition;
      const res = await getTree({ isPublic });
      if (res.data) {
        setFolderTree(res.data);
      }
    } catch {
      // 静默失败
    }
  };

  // 弹出下一个冲突弹窗
  const popNextConflict = useCallback(() => {
    if (conflictQueueRef.current.length === 0) return;
    const item = conflictQueueRef.current[0];
    setConflictModal({ fileName: item.fileName, conflictFileId: item.conflictFileId });
  }, []);

  // 处理冲突弹窗的用户选择（队列消费）
  const handleConflictChoice = useCallback((choice: 'replace' | 'keepBoth' | 'cancel') => {
    const item = conflictQueueRef.current.shift();
    setConflictModal(null);
    if (item) {
      item.resolve(choice);
      // 处理队列中下一个冲突
      popNextConflict();
    }
  }, [popNextConflict]);

  // 上传单个文件，返回冲突选择信息
  const uploadFile = async (file: File): Promise<void> => {
    const taskUid = file.name + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const task: UploadTask = {
      uid: taskUid,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'pending',
    };

    setUploadTasks((prev) => [...prev, task]);

    try {
      const initRes = await uploadInit({
        fileName: file.name,
        fileSize: file.size,
        md5: '',
        folderId: targetFolderId,
      });

      if (!initRes.data) {
        throw new Error('初始化上传失败');
      }

      const { taskId, quickDone, chunkSize, totalChunks, conflictExists, conflictFileId } = initRes.data;

      // 秒传
      if (quickDone) {
        setUploadTasks((prev) =>
          prev.map((t) => (t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t)),
        );
        return;
      }

      if (!taskId) {
        throw new Error('初始化上传失败: 未获取到taskId');
      }

      // 名称冲突检测：弹窗询问用户（队列模式，支持并发冲突）
      let overwriteFileId: number | undefined;
      if (conflictExists && conflictFileId) {
        const choice = await new Promise<'replace' | 'keepBoth' | 'cancel'>((resolve) => {
          const isFirst = conflictQueueRef.current.length === 0;
          conflictQueueRef.current.push({ fileName: file.name, conflictFileId, resolve });
          if (isFirst) {
            popNextConflict();
          }
        });

        if (choice === 'cancel') {
          // 取消该文件上传
          await uploadCancel(taskId);
          setUploadTasks((prev) =>
            prev.map((t) => (t.uid === taskUid ? { ...t, status: 'skipped' as const } : t)),
          );
          return;
        }

        if (choice === 'replace') {
          overwriteFileId = conflictFileId;
        }
        // keepBoth: 不设 overwriteFileId，走自动重名
      }

      // 更新状态为上传中
      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'uploading' as const } : t)),
      );

      const effectiveChunkSize = chunkSize ?? CHUNK_SIZE;
      const chunks = totalChunks ?? Math.max(1, Math.ceil(file.size / effectiveChunkSize));
      chunksRef.current.set(taskUid, taskId);

      // 分片上传
      for (let i = 0; i < chunks; i++) {
        const start = i * effectiveChunkSize;
        const end = Math.min(start + effectiveChunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('taskId', taskId);
        formData.append('chunkIndex', String(i));
        formData.append('file', chunk, file.name);

        await uploadChunk(formData);

        const progress = Math.round(((i + 1) / chunks) * 100);
        setUploadTasks((prev) =>
          prev.map((t) => (t.uid === taskUid ? { ...t, progress, status: 'uploading' as const } : t)),
        );
      }

      // 合并分片
      await uploadMerge({ taskId, overwriteFileId });

      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, progress: 100, status: 'done' as const } : t)),
      );
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code;
      message.error(`${file.name} 上传失败: ${code ? getErrorMessage(code) : '网络错误，请重试'}`);
      setUploadTasks((prev) =>
        prev.map((t) => (t.uid === taskUid ? { ...t, status: 'error' as const } : t)),
      );
    }
  };

  // 批量上传：每个文件独立创建异步任务，并发执行
  const customRequest = () => {};

  // 构建 TreeSelect 所需的树形数据
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildTreeData = (folders: Folder[]): any[] => {
    return folders.map((f) => ({
      value: f.id,
      title: f.folderName,
      children: f.children ? buildTreeData(f.children) : undefined,
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const treeData: any[] = buildTreeData(folderTree);

  // 新建文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    setCreateFolderSubmitting(true);
    try {
      await createFolder({ parentId: targetFolderId, folderName: newFolderName.trim(), isPublic: newFolderIsPublic });
      message.success('文件夹创建成功');
      setCreateFolderModalOpen(false);
      setNewFolderName('');
      setNewFolderIsPublic(0);
      await loadFolderTree();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setCreateFolderSubmitting(false);
    }
  };

  const handleBeforeUpload = (file: File): boolean => {
    if (!targetFolderId) {
      message.warning('请先选择目标文件夹');
      return false;
    }
    totalRef.current += 1;
    setQueueTotal(totalRef.current);
    setUploading(true);
    uploadFile(file).finally(() => {
      setUploadTasks((prev) => {
        const done = prev.filter((t) => t.status === 'done' || t.status === 'error' || t.status === 'skipped').length;
        setQueueIndex(done);
        if (done >= totalRef.current) {
          setUploading(false);
          totalRef.current = 0;
        }
        return prev;
      });
    });
    return false;
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFolderTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partition]);

  useEffect(() => {
    const queueRef = conflictQueueRef;
    return () => {
      // 组件卸载时清理冲突弹窗队列，避免 Promise 永久挂起
      while (queueRef.current.length > 0) {
        queueRef.current.shift()!.resolve('cancel');
      }
      setConflictModal(null);
    };
  }, []);

  const columns = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => {
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
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
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'default', text: '等待中' },
          uploading: { color: 'processing', text: '上传中' },
          done: { color: 'success', text: '已完成' },
          error: { color: 'error', text: '失败' },
          skipped: { color: 'warning', text: '已跳过' },
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
          <Button icon={<ReloadOutlined />} onClick={() => loadFolderTree()}>
            刷新文件夹
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        {/* 分区选择 */}
        <Space>
          <Text strong>文件类型：</Text>
          <Segmented
            options={[
              { label: '私有文件', value: 0 },
              { label: '公共文件', value: 1 },
            ]}
            value={partition}
            onChange={(val) => {
              setPartition(val as number);
              setTargetFolderId(null);
            }}
          />
        </Space>

        {/* 目标文件夹选择 */}
        <Space>
          <Text strong>目标文件夹：</Text>
          <TreeSelect
            placeholder="请选择文件夹"
            style={{ width: 280 }}
            treeData={treeData}
            value={targetFolderId}
            onChange={(val) => setTargetFolderId(val)}
            allowClear
            treeDefaultExpandAll
          />
          <Button icon={<PlusOutlined />} onClick={() => setCreateFolderModalOpen(true)}>
            新建文件夹
          </Button>
          {!targetFolderId && (
            <Text type="warning">请先选择目标文件夹后再上传文件</Text>
          )}
        </Space>

        {/* 任务进度 */}
        {queueTotal > 0 && (
          <Alert
            type="info"
            showIcon
            message={
              uploading
                ? `上传中：已完成 ${queueIndex}/${queueTotal} 个文件`
                : `全部上传完成（${queueTotal} 个文件）`
            }
          />
        )}

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
            支持批量上传，文件将排队依次处理
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

        {/* 名称冲突确认弹窗 */}
        <Modal
          title="文件名冲突"
          open={conflictModal !== null}
          onCancel={() => handleConflictChoice('cancel')}
          footer={[
            <Button key="cancel" onClick={() => handleConflictChoice('cancel')}>
              取消上传
            </Button>,
            <Button key="keep" onClick={() => handleConflictChoice('keepBoth')}>
              保留两者
            </Button>,
            <Button key="replace" type="primary" onClick={() => handleConflictChoice('replace')}>
              替换
            </Button>,
          ]}
        >
          <p>
            文件 <Text strong>{conflictModal?.fileName}</Text> 已存在，是否替换？
          </p>
          <p style={{ color: '#888', fontSize: 13 }}>
            替换将删除旧文件并上传新文件；保留两者将自动重命名新文件（如 hello(1).txt）。
          </p>
        </Modal>

        {/* 新建文件夹 Modal */}
        <Modal
          title="新建文件夹"
          open={createFolderModalOpen}
          onOk={handleCreateFolder}
          onCancel={() => {
            setCreateFolderModalOpen(false);
            setNewFolderName('');
          }}
          confirmLoading={createFolderSubmitting}
        >
          <Input
            placeholder="请输入文件夹名称"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolder}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>公共文件夹：</span>
            <Switch checked={newFolderIsPublic === 1} onChange={(v) => setNewFolderIsPublic(v ? 1 : 0)} />
          </div>
        </Modal>
      </Space>
    </Card>
  );
}

export default UploadPage;
