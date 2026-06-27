import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Tree,
  Tabs,
  Button,
  Space,
  Input,
  Modal,
  Popconfirm,
  Dropdown,
  message,
  Tag,
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
  ReloadOutlined,
  StarOutlined,
  GlobalOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useFileStore } from '@/stores/useFileStore';
import {
  createFolder,
  renameFolder,
  deleteFolder,
  deleteFile,
  addFavorite,
  listFolders,
} from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FileInfo, Folder, SortOption } from '@/types';
import { downloadFile, previewFile, updateFileVisibility } from '@/api/file';
import { useViewStore } from '@/stores/useViewStore';
import FileSearchBar from '@/components/shared/FileSearchBar';
import FileCategoryTabs from '@/components/shared/FileCategoryTabs';
import FileSortDropdown from '@/components/shared/FileSortDropdown';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileGridView from '@/components/shared/FileGridView';
import BatchShareModal from '@/components/shared/BatchShareModal';
import ShareFileModal from '@/components/shared/ShareFileModal';

const { DirectoryTree } = Tree;

function FileManager(): React.ReactNode {
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

  // 新增：搜索/分类/排序/视图状态
  const { viewMode } = useViewStore();
  const [keyword, setKeyword] = useState('');
  const [categoryKey, setCategoryKey] = useState('all');
  const [fileType, setFileType] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>({ field: 'name', order: 'asc' });
  const [batchShareOpen, setBatchShareOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareResource, setShareResource] = useState<{ id: number; shareType: number; resourceName?: string } | null>(null);

  // 子文件夹
  const [subFolders, setSubFolders] = useState<Folder[]>([]);
  const [subFoldersLoading, setSubFoldersLoading] = useState(false);

  useEffect(() => {
    // 按当前分区加载对应文件夹树
    fetchTree(currentPartition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchFiles({
      page,
      pageSize,
      keyword: keyword || undefined,
      fileType,
      sortBy: sort.field === 'name' ? 'fileName' : sort.field === 'fileSize' ? 'fileSize' : 'createTime',
      sortOrder: sort.order,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, currentPartition, page, keyword, fileType, sort]);

  const tabsItems: TabsProps['items'] = [
    { key: '0', label: '私有文件' },
    { key: '1', label: '公共文件' },
  ];

  const handleTabChange = (key: string) => {
    setPartition(Number(key));
    setPage(1);
    fetchTree(Number(key));
  };

  const handleTreeSelect: TreeProps['onSelect'] = (keys) => {
    const id = keys[0] as number | undefined;
    setFolderId(id ?? null);
    setPage(1);
    // 选中文件夹后获取子文件夹
    fetchSubFolders(id ?? null);
  };

  /** 获取当前选中文件夹的子文件夹 */
  const fetchSubFolders = async (folderId: number | null) => {
    if (folderId === null) {
      setSubFolders([]);
      return;
    }
    setSubFoldersLoading(true);
    try {
      const res = await listFolders(folderId);
      if (res.data) {
        setSubFolders(res.data);
      }
    } catch {
      setSubFolders([]);
    } finally {
      setSubFoldersLoading(false);
    }
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
      fetchTree(currentPartition);
      fetchFiles({ page, pageSize });
      fetchSubFolders(currentFolderId);
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
      fetchTree(currentPartition);
      fetchFiles({ page, pageSize });
      fetchSubFolders(currentFolderId);
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
      fetchTree(currentPartition);
      fetchFiles({ page, pageSize });
      fetchSubFolders(currentFolderId);
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

  const handleFavorite = async (id: number) => {
    try {
      await addFavorite({ targetType: 1, targetId: id });
      message.success('收藏成功');
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleToggleVisibility = async (file: FileInfo) => {
    const newVisibility = file.visibility === 1 ? 0 : 1;
    try {
      await updateFileVisibility(file.id, newVisibility);
      message.success(newVisibility === 1 ? '已设为公共' : '已设为私有');
      fetchFiles({
        page,
        pageSize,
        keyword: keyword || undefined,
        fileType,
        sortBy: sort.field === 'name' ? 'fileName' : sort.field === 'fileSize' ? 'fileSize' : 'createTime',
        sortOrder: sort.order,
      });
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleShareFile = (record: FileInfo) => {
    setShareResource({ id: record.id, shareType: 1, resourceName: record.fileName });
    setShareModalOpen(true);
  };

  const handleFolderAction = (key: string, folder: Folder) => {
    if (key === 'rename') {
      setRenameTarget(folder);
      setNewRename(folder.folderName);
      setRenameModalOpen(true);
    } else if (key === 'share') {
      setShareResource({ id: folder.id, shareType: 2, resourceName: folder.folderName });
      setShareModalOpen(true);
    } else if (key === 'delete') {
      handleDeleteFolder(folder.id);
    }
  };

  const handleSearch = useCallback((kw: string) => {
    setKeyword(kw);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((_key: string, ft?: number) => {
    setCategoryKey(_key);
    setFileType(ft);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((s: SortOption) => {
    setSort(s);
    setPage(1);
  }, []);

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
        const typeMap: Record<number, string> = { 1: '图片', 2: '视频', 3: '音频', 4: '文档', 5: '其他' };
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
      width: 280,
      render: (_: unknown, record: FileInfo) => (
        <Space>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(record.id, record.fileName)}>
            下载
          </Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewFile(record.id)}>
            预览
          </Button>
          <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleFavorite(record.id)}>
            收藏
          </Button>
          <Button type="link" size="small" icon={<ShareAltOutlined />} onClick={() => handleShareFile(record)}>
            分享
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.visibility === 1 ? <GlobalOutlined /> : <LockOutlined />}
            onClick={() => handleToggleVisibility(record)}
          >
            {record.visibility === 1 ? '公共' : '私有'}
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
      title: (
        <Dropdown
          menu={{
            items: [
              { key: 'rename', label: '重命名', icon: <EditOutlined /> },
              { key: 'share', label: '分享', icon: <ShareAltOutlined /> },
              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
            ],
            onClick: ({ key }) => handleFolderAction(key, f),
          }}
          trigger={['contextMenu']}
        >
          <span>{f.folderName}</span>
        </Dropdown>
      ),
      icon: <FolderOutlined />,
      children: f.children ? buildFolderTree(f.children) : [],
    }));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* 工具栏 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <FileSearchBar onSearch={handleSearch} placeholder="搜索文件" />
        {selectedRows.length > 0 && (
          <Button
            type="primary"
            icon={<ShareAltOutlined />}
            onClick={() => setBatchShareOpen(true)}
          >
            批量分享 ({selectedRows.length})
          </Button>
        )}
      </div>

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
          {/* 子文件夹区域 */}
          {currentFolderId !== null && subFolders.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
                padding: '8px 12px',
                background: '#fafafa',
                borderRadius: 6,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: '#888', marginRight: 4 }}>子文件夹：</span>
              {subFolders.map((folder) => (
                <Tag
                  key={folder.id}
                  icon={<FolderOutlined />}
                  color="processing"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => {
                    setFolderId(folder.id);
                    setPage(1);
                    fetchSubFolders(folder.id);
                  }}
                >
                  {folder.folderName}
                </Tag>
              ))}
            </div>
          )}
          {/* 文件操作区：分类 + 排序 + 视图，均作用于当前文件夹内文件 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <FileCategoryTabs activeKey={categoryKey} onChange={handleCategoryChange} />
            <FileSortDropdown value={sort} onChange={handleSortChange} />
            <FileViewToggle />
          </div>
          {viewMode === 'list' ? (
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
                },
                showSizeChanger: false,
              }}
              rowSelection={{
                selectedRowKeys: selectedRows.map((r) => r.id),
                onChange: (_keys, rows) => setSelectedRows(rows),
              }}
            />
          ) : (
            <FileGridView
              files={fileList}
              loading={loading}
              onDownload={(file) => handleDownloadFile((file as FileInfo).id, (file as FileInfo).fileName)}
              onPreview={(file) => handlePreviewFile((file as FileInfo).id)}
              onFavorite={(file) => handleFavorite((file as FileInfo).id)}
            />
          )}
        </div>
      </div>

      {/* 批量分享 Modal */}
      <BatchShareModal
        open={batchShareOpen}
        selectedFiles={selectedRows}
        onClose={() => setBatchShareOpen(false)}
        onSuccess={() => {
          setSelectedRows([]);
          fetchFiles({ page, pageSize });
        }}
      />

      {/* 单文件/文件夹分享 Modal */}
      {shareResource && (
        <ShareFileModal
          open={shareModalOpen}
          resourceId={shareResource.id}
          shareType={shareResource.shareType}
          resourceName={shareResource.resourceName}
          onClose={() => {
            setShareModalOpen(false);
            setShareResource(null);
          }}
          onSuccess={() => {
            fetchFiles({ page, pageSize });
          }}
        />
      )}

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
