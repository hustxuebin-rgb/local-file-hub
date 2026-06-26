import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tree,
  Tabs,
  Button,
  Space,
  Input,
  Modal,
  Form,
  Popconfirm,
  Dropdown,
  message,
  Tag,
  Spin,
  Empty,
} from 'antd';
import type { TableProps, TabsProps, TreeProps } from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  EditOutlined,
  ShareAltOutlined,
  MoreOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useFileStore } from '@/stores/useFileStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  listFiles,
  getTree,
  createFolder,
  renameFolder,
  deleteFolder,
  deleteFile,
} from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FileInfo, Folder } from '@/types';
import { downloadFile, previewFile } from '@/api/file';

const { DirectoryTree } = Tree;

function FileManager(): React.ReactNode {
  const navigate = useNavigate();
  const {
    currentPartition,
    currentFolderId,
    fileList,
    total,
    folderTree,
    loading,
    setPartition,
    setFolderId,
    fetchFiles,
    fetchTree,
  } = useFileStore();

  const [selectedRows, setSelectedRows] = useState<FileInfo[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newRename, setNewRename] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTree();
  }, [currentPartition]);

  useEffect(() => {
    fetchFiles({ page, pageSize });
  }, [currentFolderId, currentPartition, page]);

  const tabsItems: TabsProps['items'] = [
    { key: '0', label: '私有文件' },
    { key: '1', label: '公共文件' },
  ];

  const handleTabChange = (key: string) => {
    setPartition(Number(key));
    setPage(1);
  };

  const handleTreeSelect: TreeProps['onSelect'] = (keys) => {
    const id = keys[0] as number | undefined;
    setFolderId(id ?? null);
    setPage(1);
  };

  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    setSubmitting(true);
    try {
      await createFolder({
        parentId: currentFolderId,
        folderName: newFolderName.trim(),
        isPublic: currentPartition,
      });
      message.success('创建成功');
      setCreateModalOpen(false);
      setNewFolderName('');
      fetchTree();
      fetchFiles({ page, pageSize });
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameTarget || !newRename.trim()) return;
    setSubmitting(true);
    try {
      await renameFolder(renameTarget.id, newRename.trim());
      message.success('重命名成功');
      setRenameModalOpen(false);
      setRenameTarget(null);
      setNewRename('');
      fetchTree();
      fetchFiles({ page, pageSize });
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await deleteFolder(id);
      message.success('删除成功');
      fetchTree();
      fetchFiles({ page, pageSize });
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleDownloadFile = async (id: number, fileName: string) => {
    try {
      const blob = await downloadFile(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 延迟释放 Blob URL，给浏览器足够时间开始下载
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handlePreviewFile = async (id: number) => {
    try {
      const blob = await previewFile(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // 延迟释放 Blob URL，给浏览器足够时间加载
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleDeleteFile = async (id: number) => {
    try {
      await deleteFile(id);
      message.success('删除成功');
      fetchFiles({ page, pageSize });
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const columns: TableProps<FileInfo>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (name: string, record: FileInfo) => (
        <Space>
          <FileOutlined />
          <span>{name}</span>
          <Tag>{record.fileSuffix}</Tag>
        </Space>
      ),
    },
    {
      title: '文件类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 100,
      render: (type: number) => {
        const typeMap: Record<number, string> = { 0: '其他', 1: '图片', 2: '视频', 3: '音频', 4: '文档' };
        return typeMap[type] ?? '其他';
      },
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: FileInfo) => (
        <Space>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(record.id, record.fileName)}>
            下载
          </Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewFile(record.id)}>
            预览
          </Button>
          <Popconfirm
            title="确认删除此文件？"
            description="文件将移至回收站"
            onConfirm={() => handleDeleteFile(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 构建文件夹树：API 返回的是嵌套树结构，直接转换格式即可
  const buildFolderTree = (nodes: Folder[]): TreeProps['treeData'] => {
    return nodes.map((f) => ({
      key: f.id,
      title: f.folderName,
      icon: <FolderOutlined />,
      children: f.children ? buildFolderTree(f.children) : [],
    }));
  };

  const treeData = useMemo(() => buildFolderTree(folderTree), [folderTree]);

  return (
    <Card
      title="文件管理"
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            新建文件夹
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchFiles({ page, pageSize })}>
            刷新
          </Button>
        </Space>
      }
    >
      <Tabs activeKey={String(currentPartition)} items={tabsItems} onChange={handleTabChange} />

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 240, minWidth: 240 }}>
          <Card title="文件夹" size="small">
            {folderTree.length > 0 ? (
              <DirectoryTree
                treeData={treeData}
                onSelect={handleTreeSelect}
                defaultExpandAll
              />
            ) : (
              <Empty description="暂无文件夹" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          <Table<FileInfo>
            rowKey="id"
            columns={columns}
            dataSource={fileList}
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p) => {
                setPage(p);
                fetchFiles({ page: p, pageSize });
              },
              showSizeChanger: false,
            }}
            rowSelection={{
              selectedRowKeys: selectedRows.map((r) => r.id),
              onChange: (_keys, rows) => setSelectedRows(rows),
            }}
          />
        </div>
      </div>

      {/* 新建文件夹 Modal */}
      <Modal
        title="新建文件夹"
        open={createModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setCreateModalOpen(false);
          setNewFolderName('');
        }}
        confirmLoading={submitting}
      >
        <Input
          placeholder="请输入文件夹名称"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
        />
      </Modal>

      {/* 重命名 Modal */}
      <Modal
        title="重命名文件夹"
        open={renameModalOpen}
        onOk={handleRenameFolder}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenameTarget(null);
        }}
        confirmLoading={submitting}
      >
        <Input
          placeholder="请输入新名称"
          value={newRename}
          onChange={(e) => setNewRename(e.target.value)}
          onPressEnter={handleRenameFolder}
        />
      </Modal>
    </Card>
  );
}

export default FileManager;
