import { useEffect, useState, useCallback } from 'react';
import { Card, Table, message, Button, Space, Tag } from 'antd';
import type { TableProps } from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import { listPublicFiles, addFavorite, removeFavorite } from '@/api';
import { downloadFile, previewFile } from '@/api/file';
import { useViewStore } from '@/stores/useViewStore';
import { getErrorMessage } from '@/utils/errorCodes';
import FileSearchBar from '@/components/shared/FileSearchBar';
import FileCategoryTabs from '@/components/shared/FileCategoryTabs';
import FileSortDropdown from '@/components/shared/FileSortDropdown';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileGridView from '@/components/shared/FileGridView';
import type { PublicFile, SortOption } from '@/types';

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function PublicSpace(): React.ReactNode {
  const { viewMode } = useViewStore();
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryKey, setCategoryKey] = useState('all');
  const [fileType, setFileType] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>({ field: 'createTime', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPublicFiles({
        keyword: keyword || undefined,
        fileType,
        sortBy: sort.field === 'name' ? 'fileName' : sort.field === 'fileSize' ? 'fileSize' : 'createTime',
        sortOrder: sort.order,
        page,
        pageSize,
      });
      if (res.data) {
        setFiles(res.data.list);
        setTotal(res.data.total);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
  }, [keyword, fileType, sort, page, pageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

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

  const columns: TableProps<PublicFile>['columns'] = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      render: (name: string, record: PublicFile) => (
        <Space>
          <Tag>{record.fileSuffix}</Tag>
          <span>{name}</span>
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
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '上传者',
      dataIndex: 'uploaderName',
      key: 'uploaderName',
      width: 120,
      render: (name?: string) => name || '-',
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: PublicFile) => (
        <Space>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
            下载
          </Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>
            预览
          </Button>
          {favoritedIds.has(record.id) ? (
            <Button type="link" size="small" icon={<StarFilled />} onClick={() => handleRemoveFavorite(record)}>
              已收藏
            </Button>
          ) : (
            <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleFavorite(record)}>
              收藏
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="公共空间">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <FileSearchBar onSearch={handleSearch} placeholder="搜索公共文件" />
        <FileSortDropdown value={sort} onChange={handleSortChange} />
        <FileViewToggle />
      </div>
      <FileCategoryTabs activeKey={categoryKey} onChange={handleCategoryChange} />

      {viewMode === 'list' ? (
        <Table<PublicFile>
          rowKey="id"
          columns={columns}
          dataSource={files}
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
        />
      ) : (
        <FileGridView
          files={files}
          loading={loading}
          showUploader
          onDownload={(file) => handleDownload(file as PublicFile)}
          onPreview={(file) => handlePreview(file as PublicFile)}
          onFavorite={(file) => handleFavorite(file as PublicFile)}
        />
      )}
    </Card>
  );
}

export default PublicSpace;
