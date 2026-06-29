import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Button, Space, Tag, message, Popconfirm, Segmented } from 'antd';
import type { TableProps } from 'antd';
import { StarFilled, EyeOutlined } from '@ant-design/icons';
import { useFavoriteStore } from '@/stores/useFavoriteStore';
import { useViewStore } from '@/stores/useViewStore';
import { removeFavorite } from '@/api';
import { previewFile } from '@/api/file';
import { getErrorMessage } from '@/utils/errorCodes';
import { isPreviewable } from '@/utils/preview';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileSearchBar from '@/components/shared/FileSearchBar';
import FileSortDropdown from '@/components/shared/FileSortDropdown';
import FileGridView, { type GridFileItem } from '@/components/shared/FileGridView';
import type { Favorite, SortOption } from '@/types';

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const TARGET_TYPE_MAP: Record<number, { label: string; color: string }> = {
  1: { label: '文件', color: 'blue' },
  2: { label: '文件夹', color: 'orange' },
  3: { label: '分享', color: 'green' },
};

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '文件', value: '1' },
  { label: '文件夹', value: '2' },
  { label: '分享', value: '3' },
];

function FavoritesPage(): React.ReactNode {
  const navigate = useNavigate();
  const { viewMode } = useViewStore();
  const { favorites, total, loading, fetchFavorites } = useFavoriteStore();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [categoryKey, setCategoryKey] = useState('all');
  const [targetType, setTargetType] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>({ field: 'createTime', order: 'desc' });

  useEffect(() => {
    fetchFavorites(page, pageSize, keyword || undefined, targetType);
  }, [page, pageSize, keyword, targetType, fetchFavorites]);

  // 客户端排序：后端暂不支持 sortBy/sortOrder 时，前端对 favorites 进行排序
  const sortedFavorites = useMemo(() => {
    const list = [...favorites];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort.field === 'name') {
        cmp = (a.targetName || '').localeCompare(b.targetName || '');
      } else if (sort.field === 'fileSize') {
        cmp = (a.targetSize || 0) - (b.targetSize || 0);
      } else if (sort.field === 'createTime') {
        cmp = (a.createTime || '').localeCompare(b.createTime || '');
      }
      return sort.order === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [favorites, sort]);

  const handleSearch = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((val: string) => {
    setCategoryKey(val);
    setTargetType(val === 'all' ? undefined : Number(val));
    setPage(1);
  }, []);

  const handleSortChange = useCallback((newSort: SortOption) => {
    setSort(newSort);
  }, []);

  const handleRemoveFavorite = useCallback(async (record: Favorite) => {
    try {
      await removeFavorite({ targetType: record.targetType, targetId: record.targetId });
      message.success('已取消收藏');
      fetchFavorites(page, pageSize, keyword || undefined, targetType);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  }, [fetchFavorites, page, pageSize, keyword, targetType]);

  const handleView = useCallback(async (record: Favorite) => {
    if (record.targetType === 1) {
      try {
        const blob = await previewFile(record.targetId);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err: unknown) {
        const typedErr = err as { response?: { data?: { code?: number } } };
        message.error(getErrorMessage(typedErr.response?.data?.code));
      }
      return;
    }
    if (record.targetType === 2) {
      if (record.folderIsPublic === 1) {
        navigate('/public');
      } else {
        navigate('/files');
      }
      return;
    }
    if (record.targetType === 3) {
      message.info('分享查看功能开发中');
      return;
    }
  }, [navigate]);

  const columns: TableProps<Favorite>['columns'] = [
    {
      title: '资源名称',
      dataIndex: 'targetName',
      key: 'targetName',
      width: 260,
      ellipsis: { showTitle: false },
    },
    {
      title: '类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 110,
      render: (_type: number, record: Favorite) => {
        if (record.targetType === 2) return '文件夹';
        if (record.targetType === 3) return '分享';
        const ext = record.targetName?.split('.').pop()?.toUpperCase() || '';
        return ext || '-';
      },
    },
    {
      title: '大小',
      dataIndex: 'targetSize',
      key: 'targetSize',
      width: 120,
      render: (size: number) => (size > 0 ? formatFileSize(size) : '-'),
    },
    {
      title: '拥有者',
      dataIndex: 'ownerName',
      key: 'ownerName',
      width: 120,
    },
    {
      title: '收藏时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: Favorite) => (
        <Space>
          {record.targetType === 1 && isPreviewable(record.targetName?.split('.').pop()) ? (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
              预览
            </Button>
          ) : record.targetType !== 1 ? (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
              查看
            </Button>
          ) : null}
          <Popconfirm
            title="确认取消收藏？"
            onConfirm={() => handleRemoveFavorite(record)}
          >
            <Button type="link" size="small" danger icon={<StarFilled />}>
              取消收藏
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const gridData: GridFileItem[] = sortedFavorites.map((f) => ({
    id: f.id,
    userId: 0,
    folderId: 0,
    fileName: f.targetName,
    saveName: f.targetName,
    fileSuffix: f.targetType === 2 ? '文件夹' : '',
    fileType: f.targetType === 2 ? 6 : 4,
    fileSize: f.targetSize,
    mimeType: '',
    md5: '',
    fullPath: '',
    visibility: 0,
    isDelete: 0,
    createTime: f.createTime,
    uploaderName: f.ownerName,
    targetType: f.targetType,
    targetId: f.targetId,
    targetName: f.targetName,
    targetSize: f.targetSize,
    ownerName: f.ownerName,
  }));

  return (
    <Card title="我的收藏">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <FileSearchBar onSearch={handleSearch} placeholder="搜索收藏" />
        <Segmented
          options={categoryOptions}
          value={categoryKey}
          onChange={(val) => handleCategoryChange(val as string)}
        />
        <FileSortDropdown value={sort} onChange={handleSortChange} />
        <FileViewToggle />
      </div>
      {viewMode === 'list' ? (
        <Table<Favorite>
          rowKey="id"
          columns={columns}
          dataSource={sortedFavorites}
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
          files={gridData}
          loading={loading}
          onRemoveFavorite={(file) => {
            const fav = sortedFavorites.find(
              (f) => f.targetType === file.targetType && f.targetId === file.targetId,
            );
            if (fav) handleRemoveFavorite(fav);
          }}
        />
      )}
    </Card>
  );
}

export default FavoritesPage;
