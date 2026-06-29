import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Card, Table, message, Button, Space, Tag, Breadcrumb, Empty, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  StarOutlined,
  StarFilled,
  FolderOutlined,
  FileOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { listPublicFiles, listPublicFolders, addFavorite, removeFavorite, downloadFolder } from '@/api';
import { downloadFile, previewFile } from '@/api/file';
import { useViewStore } from '@/stores/useViewStore';
import { getErrorMessage } from '@/utils/errorCodes';
import { isPreviewable } from '@/utils/preview';
import FileSearchBar from '@/components/shared/FileSearchBar';
import FileCategoryTabs from '@/components/shared/FileCategoryTabs';
import FileSortDropdown from '@/components/shared/FileSortDropdown';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileGridView from '@/components/shared/FileGridView';
import type { GridFileItem } from '@/components/shared/FileGridView';
import type { PublicFile, PublicFolder, SortOption, PublicListItem } from '@/types';

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** 面包屑节点 */
interface BreadcrumbItem {
  id: number | null;
  name: string;
}

/** 递归展平文件夹树结构为扁平数组 */
function flattenFolderTree(folders: PublicFolder[]): PublicFolder[] {
  const result: PublicFolder[] = [];
  const walk = (list: PublicFolder[]) => {
    for (const f of list) {
      result.push(f);
      if (f.children && f.children.length > 0) {
        walk(f.children);
      }
    }
  };
  walk(folders);
  return result;
}

function PublicSpace(): React.ReactNode {
  const { viewMode } = useViewStore();
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [fileTotal, setFileTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryKey, setCategoryKey] = useState('all');
  const [fileType, setFileType] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>({ field: 'createTime', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());

  // 文件夹相关状态
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: '公共空间' }]);
  const [publicFolders, setPublicFolders] = useState<PublicFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // 竞态防护：取消上一次未完成的请求
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const res = await listPublicFiles({
        keyword: keyword || undefined,
        fileType,
        sortBy: sort.field,
        sortOrder: sort.order,
        page,
        pageSize,
        folderId: currentFolderId ?? undefined,
        signal: controller.signal,
      });
      if (res.data) {
        setFiles(res.data.list);
        setFileTotal(res.data.total);
      }
    } catch (err: unknown) {
      // 忽略取消请求的错误
      if (axios.isCancel(err)) {
        return;
      }
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
  }, [keyword, fileType, sort, page, pageSize, currentFolderId]);

  // 获取当前层级的子文件夹
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const res = await listPublicFolders();
      if (res.data) {
        // 先展平树结构，再按 parentId 过滤当前层级
        const flat = flattenFolderTree(res.data);
        const parentId = currentFolderId ?? 0;
        const filtered = flat.filter((f) => f.parentId === parentId);
        setPublicFolders(filtered);
      }
    } catch {
      // 静默失败
    } finally {
      setFoldersLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // 组件卸载时清理未完成的请求
  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  /** 合并子文件夹与文件为统一列表 */
  const mergedList = useMemo<PublicListItem[]>(() => {
    const folderItems: PublicListItem[] = publicFolders.map((f) => ({
      itemType: 'folder' as const,
      id: f.id,
      name: f.folderName,
      fileType: 6,
      fileSize: 0,
      createTime: '',
      uploaderName: f.uploaderName,
      folderData: f,
    }));
    const fileItems: PublicListItem[] = files.map((f) => ({
      itemType: 'file' as const,
      id: f.id,
      name: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      fileSuffix: f.fileSuffix,
      createTime: f.createTime,
      uploaderName: f.uploaderName,
      mimeType: f.mimeType,
    }));
    if (fileType !== undefined) {
      return fileItems;
    }
    return [...folderItems, ...fileItems];
  }, [publicFolders, files, fileType]);

  /** 分页 total：全部 Tab 时加上当前层级文件夹数 */
  const total = useMemo(() => {
    if (fileType === undefined) {
      return fileTotal + publicFolders.length;
    }
    return fileTotal;
  }, [fileTotal, publicFolders.length, fileType]);

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

  const handleDownload = async (file: PublicFile) => {
    try {
      const blob = await downloadFile(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handlePreview = async (file: PublicFile) => {
    try {
      const blob = await previewFile(file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleFavorite = async (file: PublicFile) => {
    try {
      await addFavorite({ targetType: 1, targetId: file.id });
      message.success('收藏成功');
      setFavoritedIds((prev) => new Set(prev).add(file.id));
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleRemoveFavorite = async (file: PublicFile) => {
    try {
      await removeFavorite({ targetType: 1, targetId: file.id });
      message.success('已取消收藏');
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
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

  // 进入子文件夹
  const handleEnterFolder = (folder: PublicFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.folderName }]);
    setPage(1);
  };

  // 面包屑导航
  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumb[index];
    setCurrentFolderId(target.id);
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    setPage(1);
  };

  const columns: TableProps<PublicListItem>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      ellipsis: { showTitle: false },
      render: (name: string, record: PublicListItem) => (
        <Space>
          {record.itemType === 'folder' ? <FolderOutlined /> : <FileOutlined />}
          {record.itemType === 'folder' ? (
            <>
              <Tooltip title={name}>
                <span style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{name}</span>
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
      render: (_type: number, record: PublicListItem) => {
        if (record.itemType === 'folder') return '文件夹';
        let suffix = record.fileSuffix?.replace(/^\./, '') || '';
        if (!suffix) {
          suffix = record.name?.split('.').pop() || '';
        }
        return suffix.toUpperCase() || '-';
      },
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      render: (_size: number, record: PublicListItem) => {
        if (record.itemType === 'folder') return '-';
        return formatFileSize(record.fileSize);
      },
    },
    {
      title: '上传者',
      dataIndex: 'uploaderName',
      key: 'uploaderName',
      width: 120,
      render: (_name: string, record: PublicListItem) => {
        if (record.itemType === 'folder') return record.folderData?.uploaderName || '-';
        return record.uploaderName || '-';
      },
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (_time: string, record: PublicListItem) => {
        if (record.itemType === 'folder') return '-';
        return record.createTime;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_: unknown, record: PublicListItem) => {
        if (record.itemType === 'folder') {
          return (
            <Space>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadFolder(record.id, record.name)}
              >
                下载
              </Button>
              <span style={{ color: '#999' }}>双击进入</span>
            </Space>
          );
        }
        return (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record as unknown as PublicFile)}
            >
              下载
            </Button>
            {isPreviewable((record as unknown as PublicFile).fileSuffix) && (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handlePreview(record as unknown as PublicFile)}
              >
                预览
              </Button>
            )}
            {favoritedIds.has(record.id) ? (
              <Button
                type="link"
                size="small"
                icon={<StarFilled />}
                onClick={() => handleRemoveFavorite(record as unknown as PublicFile)}
              >
                已收藏
              </Button>
            ) : (
              <Button
                type="link"
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleFavorite(record as unknown as PublicFile)}
              >
                收藏
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card title="公共空间">
      {/* 面包屑导航 */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={breadcrumb.map((item, index) => ({
            key: item.id ?? 'root',
            title: (
              <span
                style={{
                  cursor: index < breadcrumb.length - 1 ? 'pointer' : 'default',
                  color: index < breadcrumb.length - 1 ? '#1677ff' : 'inherit',
                }}
                onClick={() => {
                  if (index < breadcrumb.length - 1) {
                    handleBreadcrumbClick(index);
                  }
                }}
              >
                {index === 0 && <HomeOutlined style={{ marginRight: 4 }} />}
                {index > 0 && <FolderOutlined style={{ marginRight: 4 }} />}
                {item.name}
              </span>
            ),
          }))}
        />
      </div>

      {/* 文件操作区 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <FileSearchBar onSearch={handleSearch} placeholder="搜索公共文件" />
        <FileSortDropdown value={sort} onChange={handleSortChange} />
        <FileViewToggle />
      </div>
      <FileCategoryTabs activeKey={categoryKey} onChange={handleCategoryChange} />

      {viewMode === 'list' ? (
        <Table<PublicListItem>
          rowKey={(record) => `${record.itemType}-${record.id}`}
          columns={columns}
          dataSource={mergedList}
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
          onRow={(record: PublicListItem) => ({
            style: { cursor: record.itemType === 'folder' ? 'pointer' : 'default' },
            onDoubleClick: record.itemType === 'folder' && record.folderData ? () => {
              handleEnterFolder(record.folderData!);
            } : undefined,
          })}
        />
      ) : (
        <FileGridView
          files={mergedList as unknown as GridFileItem[]}
          loading={loading}
          showUploader
          onDownload={(file) => handleDownload(file as PublicFile)}
          onPreview={(file) => handlePreview(file as PublicFile)}
          onFavorite={(file) => handleFavorite(file as PublicFile)}
        />
      )}

      {/* 空状态：无文件夹且无文件 */}
      {!loading && !foldersLoading && mergedList.length === 0 && (
        <Empty description="暂无内容" />
      )}
    </Card>
  );
}

export default PublicSpace;
