import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, message, Popconfirm } from 'antd';
import type { TableProps } from 'antd';
import { StarFilled, EyeOutlined } from '@ant-design/icons';
import { useFavoriteStore } from '@/stores/useFavoriteStore';
import { useViewStore } from '@/stores/useViewStore';
import { removeFavorite } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import FileViewToggle from '@/components/shared/FileViewToggle';
import FileGridView, { type GridFileItem } from '@/components/shared/FileGridView';
import type { Favorite } from '@/types';

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

function FavoritesPage(): React.ReactNode {
  const { viewMode } = useViewStore();
  const { favorites, total, loading, fetchFavorites } = useFavoriteStore();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  useEffect(() => {
    fetchFavorites(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleRemoveFavorite = useCallback(async (record: Favorite) => {
    try {
      await removeFavorite({ targetType: record.targetType, targetId: record.targetId });
      message.success('已取消收藏');
      fetchFavorites(page, pageSize);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  }, [fetchFavorites, page, pageSize]);

  const handleView = useCallback((record: Favorite) => {
    if (record.targetType === 3) {
      message.info('分享查看功能开发中');
      return;
    }
    // 文件/文件夹: 有 thumbnail 链接可以打开
    const thumbnailUrl = `/api/media/thumbnail/${record.targetId}`;
    window.open(thumbnailUrl, '_blank');
  }, []);

  const columns: TableProps<Favorite>['columns'] = [
    {
      title: '资源名称',
      dataIndex: 'targetName',
      key: 'targetName',
    },
    {
      title: '类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 100,
      render: (type: number) => {
        const info = TARGET_TYPE_MAP[type] ?? { label: '未知', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
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
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
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

  const gridData: GridFileItem[] = favorites.map((f) => ({
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
    <Card
      title="我的收藏"
      extra={<FileViewToggle />}
    >
      {viewMode === 'list' ? (
        <Table<Favorite>
          rowKey="id"
          columns={columns}
          dataSource={favorites}
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
            const fav = favorites.find(
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
