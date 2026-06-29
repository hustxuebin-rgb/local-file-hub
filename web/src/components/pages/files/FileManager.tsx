import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
  Breadcrumb,
  message,
  Tag,
  Empty,
  Tooltip,
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
  StarFilled,
  GlobalOutlined,
  LockOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useFileStore } from '@/stores/useFileStore';
import { useFavoriteStore } from '@/stores/useFavoriteStore';
import {
  createFolder,
  renameFolder,
  deleteFolder,
  downloadFolder,
  deleteFile,
  listFolders,
  updateFolderVisibility,
} from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import { isPreviewable } from '@/utils/preview';
import type { FileInfo, Folder, SortOption, ListItem } from '@/types';
import { downloadFile, previewFile, updateFileVisibility, downloadInit } from '@/api/file';
import { useViewStore } from '@/stores/useViewStore';
import { useDownload } from '@/hooks/useDownload';
import FileCategoryTabs from '@/components/shared/FileCategoryTabs';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileGridView from '@/components/shared/FileGridView';
import FileSearchBar from '@/components/shared/FileSearchBar';
import FileSortDropdown from '@/components/shared/FileSortDropdown';
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
    updateLocalFileVisibility,
    updateLocalFolderVisibility,
  } = useFileStore();

  const { favoritedIds, fetchFavorites, toggleFavorite } = useFavoriteStore();

  const [selectedRows, setSelectedRows] = useState<FileInfo[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newRename, setNewRename] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [treeExpandedKeys, setTreeExpandedKeys] = useState<React.Key[]>([]);
  const [treeSelectedKeys, setTreeSelectedKeys] = useState<React.Key[]>([]);

  // 新增：搜索/分类/排序/视图状态
  const { viewMode } = useViewStore();
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryKey, setCategoryKey] = useState('all');
  const [fileType, setFileType] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>({ field: 'name', order: 'asc' });
  const [batchShareOpen, setBatchShareOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareResource, setShareResource] = useState<{ id: number; shareType: number; resourceName?: string } | null>(null);

  // 面包屑导航
  interface BreadcrumbItem {
    id: number | null;
    name: string;
  }
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: '文件管理' }]);

  // 子文件夹
  const [subFolders, setSubFolders] = useState<Folder[]>([]);

  // 密码确认弹框（私有→公共）
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<FileInfo | null>(null);
  const [pwdFolderTarget, setPwdFolderTarget] = useState<ListItem | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  // 下载管理
  const { startDownload } = useDownload();
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

  // 初始化树展开状态（仅首次 folderTree 加载后执行一次）
  const treeInitializedRef = useRef(false);

  useEffect(() => {
    // 按当前分区加载对应文件夹树
    fetchTree(currentPartition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初始化收藏状态（用于收藏图标切换）
  useEffect(() => {
    fetchFavorites(1, 9999);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchFiles({
      page,
      pageSize,
      keyword: keyword || undefined,
      fileType,
      sortBy: sort.field,
      sortOrder: sort.order,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, currentPartition, page, keyword, fileType, sort]);

  // Ant Design Table onChange 回调：处理分页、排序、筛选
  const handleTableChange: TableProps<ListItem>['onChange'] = useCallback(
    (_pagination, _filters, sorter) => {
      // 只处理排序（分页已在 pagination.onChange 单独处理）
      if (!Array.isArray(sorter) && sorter.order) {
        const fieldMap: Record<string, SortOption['field']> = {
          fileName: 'name',
          fileType: 'fileType',
          fileSize: 'fileSize',
          createTime: 'createTime',
        };
        const sortBy = fieldMap[sorter.field as string] || 'createTime';
        const sortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
        setSort({ field: sortBy, order: sortOrder });
        setPage(1);
      }
    },
    [],
  );

  useEffect(() => {
    if (folderTree.length > 0 && !treeInitializedRef.current) {
      setTreeExpandedKeys(folderTree.map(f => f.id));
      treeInitializedRef.current = true;
    }
  }, [folderTree]);

  const tabsItems: TabsProps['items'] = [
    { key: '0', label: '私有文件' },
    { key: '1', label: '公共文件' },
  ];

  const handleTabChange = (key: string) => {
    setPartition(Number(key));
    setPage(1);
    setKeyword('');
    setSearchInput('');
    treeInitializedRef.current = false; // 切换分区后新树需自动展开
    fetchTree(Number(key));
  };

  // 搜索防抖
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((kw: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setKeyword(kw);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    setSelectedRowKeys([]);
    setSelectedRows([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value === '') {
      setKeyword('');
      setPage(1);
    } else {
      searchTimerRef.current = setTimeout(() => {
        setKeyword(value);
        setPage(1);
      }, 400);
    }
  }, []);

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
    try {
      const res = await listFolders(folderId);
      if (res.data) {
        setSubFolders(res.data);
      }
    } catch {
      setSubFolders([]);
    }
  };

  /** 将树节点同步到指定文件夹：展开路径上的祖先节点 + 选中目标节点 */
  const syncTreeToFolder = useCallback((folderId: number) => {
    const findPath = (
      nodes: Folder[],
      targetId: number,
      path: number[]
    ): number[] | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return [...path, node.id];
        }
        if (node.children && node.children.length > 0) {
          const result = findPath(node.children, targetId, [...path, node.id]);
          if (result) return result;
        }
      }
      return null;
    };

    const path = findPath(folderTree, folderId, []);
    if (path && path.length > 0) {
      setTreeExpandedKeys(prev => {
        const newKeys = new Set([...prev, ...path.slice(0, -1)]);
        return Array.from(newKeys);
      });
      setTreeSelectedKeys([folderId]);
    }
  }, [folderTree]);

  /** 从 folderTree 递归查找当前 currentFolderId 的面包屑路径 */
  const findBreadcrumbPath = useCallback((targetId: number | null): BreadcrumbItem[] => {
    if (targetId === null) return [{ id: null, name: '文件管理' }];

    const findPath = (
      nodes: Folder[],
      id: number,
      path: BreadcrumbItem[],
    ): BreadcrumbItem[] | null => {
      for (const node of nodes) {
        const current: BreadcrumbItem = { id: node.id, name: node.folderName };
        if (node.id === id) {
          return [...path, current];
        }
        if (node.children && node.children.length > 0) {
          const result = findPath(node.children, id, [...path, current]);
          if (result) return result;
        }
      }
      return null;
    };

    const path = findPath(folderTree, targetId, []);
    return path ? [{ id: null, name: '文件管理' }, ...path] : [{ id: null, name: '文件管理' }];
  }, [folderTree]);

  // 面包屑随 currentFolderId 变化自动更新
  useEffect(() => {
    setBreadcrumb(findBreadcrumbPath(currentFolderId));
  }, [currentFolderId, findBreadcrumbPath]);

  /** 面包屑点击：回退到对应层级并同步树状态 */
  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumb[index];
    setFolderId(target.id);
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    setPage(1);
    fetchSubFolders(target.id);
    if (target.id !== null) {
      syncTreeToFolder(target.id);
    } else {
      setTreeSelectedKeys([]);
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

  const handleDownloadFolder = async (id: number, folderName: string) => {
    try {
      const blob = await downloadFolder(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = folderName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleDownloadFile = async (id: number, fileName: string, fileSize?: number) => {
    // 大文件（>50MB）使用分片下载模式，进度通过 Header 任务图标查看
    if (fileSize && fileSize > LARGE_FILE_THRESHOLD) {
      await startDownload(id);
      return;
    }

    // 小文件：传统下载方式
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

  const handleToggleFav = async (targetType: number, targetId: number) => {
    try {
      await toggleFavorite(targetType, targetId);
      const isNowFavorited = favoritedIds.has(targetId);
      message.success(isNowFavorited ? '已取消收藏' : '收藏成功');
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleToggleVisibility = (file: FileInfo) => {
    if (file.visibility === 0) {
      // 私有 → 公共：需要密码确认
      setPwdTarget(file);
      setPwdValue('');
      setPwdError('');
      setPwdModalOpen(true);
    } else {
      // 公共 → 私有：弹框确认
      Modal.confirm({
        title: '设为私有',
        content: `确认将「${file.fileName}」设为私有？设为私有后仅自己可见。`,
        okText: '确认',
        cancelText: '取消',
        onOk: async () => {
          try {
            await doToggleVisibility(file, 0);
          } catch (err: unknown) {
            const typedErr = err as { response?: { data?: { code?: number } } };
            message.error(getErrorMessage(typedErr.response?.data?.code));
          }
        },
      });
    }
  };

  const handleToggleFolderVisibility = (record: ListItem) => {
    if (record.visibility === 0) {
      // 私有 → 公共：需要密码确认
      setPwdFolderTarget(record);
      setPwdValue('');
      setPwdError('');
      setPwdModalOpen(true);
    } else {
      // 公共 → 私有：弹框确认
      Modal.confirm({
        title: '设为私有',
        content: `确认将「${record.fileName}」设为私有？设为私有后仅自己可见。`,
        okText: '确认',
        cancelText: '取消',
        onOk: async () => {
          try {
            await updateFolderVisibility(record.id, 0);
            updateLocalFolderVisibility(record.id, 0);
            message.success('已设为私有');
          } catch (err: unknown) {
            const typedErr = err as { response?: { data?: { code?: number } } };
            message.error(getErrorMessage(typedErr.response?.data?.code));
          }
        },
      });
    }
  };

  /** 实际执行可见性切换（不展示错误toast，由调用方处理） */
  const doToggleVisibility = async (file: FileInfo, newVisibility: number, password?: string) => {
    await updateFileVisibility(file.id, newVisibility, password);
    // 原地更新本地状态（不切换标签页）
    updateLocalFileVisibility(file.id, newVisibility);
    const label = newVisibility === 1 ? '公共' : '私有';
    const hint = newVisibility === 1
      ? `已设为公共，可在「公共文件」标签页查看`
      : `已设为私有，可在「私有文件」标签页查看`;
    message.success(`${label} · ${hint}`);
  };

  /** 密码确认后执行可见性切换 */
  const handlePwdConfirm = async () => {
    if (pwdSubmitting) return;
    if (!pwdValue) {
      setPwdError('请输入账户密码');
      return;
    }
    setPwdSubmitting(true);
    setPwdError('');
    try {
      if (pwdTarget) {
        // 文件可见性切换
        await doToggleVisibility(pwdTarget, 1, pwdValue);
      } else if (pwdFolderTarget) {
        // 文件夹可见性切换
        await updateFolderVisibility(pwdFolderTarget.id, 1, pwdValue);
        updateLocalFolderVisibility(pwdFolderTarget.id, 1);
        message.success('已设为公共');
      } else {
        return;
      }
      setPwdModalOpen(false);
      setPwdTarget(null);
      setPwdFolderTarget(null);
      setPwdValue('');
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      setPwdError(getErrorMessage(typedErr.response?.data?.code, '密码验证失败'));
    } finally {
      setPwdSubmitting(false);
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

  // 搜索回调（已移至上方 handleSearchChange）

  const handleCategoryChange = useCallback((_key: string, ft?: number) => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    setCategoryKey(_key);
    setFileType(ft);
    setPage(1);
  }, []);

  const columns: TableProps<ListItem>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: { showTitle: false },
      sorter: (a, b) => a.fileName.localeCompare(b.fileName, 'zh'),
      sortDirections: ['ascend', 'descend'],
      render: (name: string, record: ListItem) => (
        <Space>
          {record.itemType === 'folder' ? <FolderOutlined /> : <FileOutlined />}
          {record.itemType === 'folder' ? (
            <>
              <Tooltip title={name}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{name}</span>
              </Tooltip>
              <Tag color="processing">文件夹</Tag>
            </>
          ) : (
            <Tooltip title={name}>
              <span>{name}</span>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '文件类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 110,
      sorter: (a, b) => a.fileType - b.fileType,
      render: (_type: number, record: ListItem) => {
        if (record.itemType === 'folder') return '文件夹';
        const suffix = record.fileSuffix?.replace(/^\./, '') || '';
        return suffix.toUpperCase() || '-';
      },
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      sorter: (a, b) => a.fileSize - b.fileSize,
      render: (_size: number, record: ListItem) => {
        if (record.itemType === 'folder') return '-';
        return formatFileSize(record.fileSize);
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      sorter: (a, b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime(),
      defaultSortOrder: 'ascend',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: ListItem) => {
        if (record.itemType === 'folder') {
          return (
            <Space>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setRenameTarget(record.folderData!);
                  setNewRename(record.folderData!.folderName);
                  setRenameModalOpen(true);
                }}
              >
                重命名
              </Button>
              <Button
                type="link"
                size="small"
                icon={<ShareAltOutlined />}
                onClick={() => {
                  setShareResource({ id: record.id, shareType: 2, resourceName: record.fileName });
                  setShareModalOpen(true);
                }}
              >
                分享
              </Button>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadFolder(record.id, record.fileName)}
              >
                下载
              </Button>
              {favoritedIds.has(record.id) ? (
                <Button
                  type="link"
                  size="small"
                  icon={<StarFilled />}
                  onClick={() => handleToggleFav(2, record.id)}
                >
                  已收藏
                </Button>
              ) : (
                <Button
                  type="link"
                  size="small"
                  icon={<StarOutlined />}
                  onClick={() => handleToggleFav(2, record.id)}
                >
                  收藏
                </Button>
              )}
              <Button
                type="link"
                size="small"
                icon={record.visibility === 1 ? <GlobalOutlined /> : <LockOutlined />}
                onClick={() => handleToggleFolderVisibility(record)}
              >
                {record.visibility === 1 ? '公共' : '私有'}
              </Button>
              <Popconfirm
                title="确认删除此文件夹？"
                description="文件夹及其内容将被删除"
                onConfirm={() => handleDeleteFolder(record.id)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          );
        }
        return (
          <Space>
            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(record.id, record.fileName, record.fileSize)}>
              下载
            </Button>
            {isPreviewable(record.fileSuffix) && (
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewFile(record.id)}>
                预览
              </Button>
            )}
            {favoritedIds.has(record.id) ? (
              <Button type="link" size="small" icon={<StarFilled />} onClick={() => handleToggleFav(1, record.id)}>
                已收藏
              </Button>
            ) : (
              <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleToggleFav(1, record.id)}>
                收藏
              </Button>
            )}
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
        );
      },
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

  /** 合并子文件夹与文件为统一列表 */
  const mergedList = useMemo<ListItem[]>(() => {
    const folderItems: ListItem[] = subFolders.map((f) => ({
      id: f.id,
      userId: f.userId ?? 0,
      folderId: f.parentId,
      fileName: f.folderName,
      saveName: '',
      fileSuffix: '',
      fileType: 6, // 文件夹类型
      fileSize: 0,
      mimeType: undefined,
      md5: '',
      fullPath: f.fullPath ?? '',
      visibility: f.isPublic ?? 0,
      isDelete: 0,
      createTime: f.createTime ?? '',
      itemType: 'folder' as const,
      folderData: f,
    }));
    const fileItems: ListItem[] = fileList.map((f) => ({
      ...f,
      itemType: 'file' as const,
    }));
    if (fileType !== undefined) {
      return fileItems;
    }
    return [...folderItems, ...fileItems];
  }, [subFolders, fileList, fileType]);

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
          <Input.Search
            placeholder="搜索文件"
            allowClear
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 220 }}
          />
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
                expandedKeys={treeExpandedKeys}
                selectedKeys={treeSelectedKeys}
                onSelect={(keys, info) => {
                  handleTreeSelect(keys, info);
                  if (info.node.key && treeExpandedKeys.includes(info.node.key)) {
                    setTreeExpandedKeys(prev => prev.filter(k => k !== info.node.key));
                  } else {
                    setTreeExpandedKeys(prev => [...prev, info.node.key as React.Key]);
                  }
                }}
                onExpand={(keys) => setTreeExpandedKeys(keys)}
              />
            ) : (
              <Empty description="暂无文件夹" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          {/* 文件操作区：分类在左，批量分享+视图在右 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <FileCategoryTabs activeKey={categoryKey} onChange={handleCategoryChange} />
            {selectedRows.length > 0 && (
              <Button
                type="primary"
                size="small"
                icon={<ShareAltOutlined />}
                onClick={() => setBatchShareOpen(true)}
              >
                批量分享 ({selectedRows.length})
              </Button>
            )}
            <span style={{ marginLeft: 'auto' }}>
              <FileSortDropdown value={sort} onChange={(newSort) => { setSort(newSort); setPage(1); }} />
              <FileViewToggle />
            </span>
          </div>
          {viewMode === 'list' ? (
            <Table<ListItem>
              rowKey={(record) => `${record.itemType}-${record.id}`}
              columns={columns}
              dataSource={mergedList}
              loading={loading}
              onChange={handleTableChange}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: (p) => {
                  setPage(p);
                  setSelectedRowKeys([]);
                  setSelectedRows([]);
                },
                showSizeChanger: false,
              }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys, rows) => {
                  setSelectedRowKeys(keys);
                  setSelectedRows(rows.filter((r: ListItem) => r.itemType === 'file') as FileInfo[]);
                },
                getCheckboxProps: (record: ListItem) => ({
                  disabled: record.itemType === 'folder',
                }),
              }}
              onRow={(record: ListItem) => ({
                style: { cursor: record.itemType === 'folder' ? 'pointer' : 'default' },
                onDoubleClick: record.itemType === 'folder' ? () => {
                  setFolderId(record.id);
                  setPage(1);
                  fetchSubFolders(record.id);
                  syncTreeToFolder(record.id);
                } : undefined,
              })}
            />
          ) : (
            <FileGridView
              files={mergedList}
              loading={loading}
              onDownload={(file) => handleDownloadFile((file as FileInfo).id, (file as FileInfo).fileName, (file as FileInfo).fileSize)}
              onPreview={(file) => handlePreviewFile((file as FileInfo).id)}
              onFavorite={(file) => handleToggleFav(1, (file as FileInfo).id)}
              onRemoveFavorite={(file) => handleToggleFav(1, (file as FileInfo).id)}
              isFavorited={(id: number) => favoritedIds.has(id)}
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
          setSelectedRowKeys([]);
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

      {/* 密码确认 Modal（私有→共有） */}
      <Modal
        title="设为公共"
        open={pwdModalOpen}
        onOk={handlePwdConfirm}
        onCancel={() => {
          setPwdModalOpen(false);
          setPwdTarget(null);
          setPwdFolderTarget(null);
          setPwdValue('');
          setPwdError('');
        }}
        confirmLoading={pwdSubmitting}
        okText="确认"
        cancelText="取消"
      >
        <p style={{ marginBottom: 12 }}>
          将「{pwdTarget?.fileName ?? pwdFolderTarget?.fileName}」设为公共，所有人可见。请输入账户密码确认：
        </p>
        <Input.Password
          placeholder="请输入密码"
          value={pwdValue}
          onChange={(e) => {
            setPwdValue(e.target.value);
            setPwdError('');
          }}
          onPressEnter={handlePwdConfirm}
          status={pwdError ? 'error' : undefined}
        />
        {pwdError && <p style={{ color: '#ff4d4f', marginTop: 8, marginBottom: 0 }}>{pwdError}</p>}
      </Modal>
    </Card>
  );
}

export default FileManager;
