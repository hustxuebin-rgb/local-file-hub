import { View, Text, ScrollView } from '@tarojs/components';
import { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, Cell } from '@nutui/nutui-react-taro';
import { listFavorites, removeFavorite } from '../../utils/api';
import type { FavoriteItem } from '../../utils/api';
import './index.scss';

const STORAGE_VIEW_MODE_KEY = 'favorites_view_mode';

const TARGET_TYPE_LABELS: Record<number, string> = {
  1: '文件',
  2: '文件夹',
  3: '分享',
};

const TARGET_TYPE_EMOJIS: Record<number, string> = {
  1: '📄',
  2: '📁',
  3: '🔗',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface FavoritesProps {}

function FavoritesPage(_props: FavoritesProps): JSX.Element {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (Taro.getStorageSync(STORAGE_VIEW_MODE_KEY) as 'grid' | 'list') || 'grid',
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useDidShow(() => {
    setPage(1);
    setHasMore(true);
    loadData(1);
  });

  usePullDownRefresh(async () => {
    setPage(1);
    setHasMore(true);
    await loadData(1);
    Taro.stopPullDownRefresh();
  });

  useReachBottom(() => {
    if (!hasMore || loadingMore || loading) return;
    loadMore();
  });

  const loadData = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await listFavorites({ page: pageNum, pageSize: 20 });
      if (pageNum === 1) {
        setItems(res?.list || []);
      } else {
        setItems((prev) => [...prev, ...(res?.list || [])]);
      }
      setHasMore((res?.list || []).length >= 20);
      setPage(pageNum);
    } catch {
      // handled in request
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    loadData(page + 1);
  }, [page, loadData]);

  const handleViewToggle = useCallback((mode: 'grid' | 'list') => {
    setViewMode(mode);
    Taro.setStorageSync(STORAGE_VIEW_MODE_KEY, mode);
  }, []);

  const handleItemClick = useCallback((item: FavoriteItem) => {
    if (item.targetType === 1) {
      // 文件：暂跳转到预览页，实际需要具体文件ID
      Taro.navigateTo({ url: `/pages/share-content/index?fileId=${item.targetId}` });
    } else if (item.targetType === 2) {
      // 文件夹：跳转到我的备份首页（需扩展支持直接进入某文件夹）
      Taro.showToast({ title: `文件夹: ${item.targetName}`, icon: 'none' });
    } else if (item.targetType === 3) {
      // 分享：查看分享内容
      Taro.navigateTo({ url: `/pages/share-content/index?shareId=${item.targetId}` });
    }
  }, []);

  const handleRemoveFavorite = useCallback(async (item: FavoriteItem, e?: any) => {
    if (e) e.stopPropagation();
    if (removingId) return;
    setRemovingId(item.id);
    try {
      await removeFavorite({ targetType: item.targetType, targetId: item.targetId });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      Taro.showToast({ title: '已取消收藏', icon: 'none' });
    } catch {
      // handled in request
    } finally {
      setRemovingId(null);
    }
  }, [removingId]);

  if (loading) {
    return (
      <View className="favorites-page">
        <View className="favorites-page__loading"><Loading>加载中...</Loading></View>
      </View>
    );
  }

  return (
    <View className="favorites-page">
      {/* 视图切换工具栏 */}
      <View className="favorites-page__toolbar">
        <Text className="favorites-page__title">
          我的收藏 ({items.length})
        </Text>
        <View className="favorites-page__view-toggle">
          <Text
            className={`favorites-page__view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleViewToggle('grid')}
          >
            ▦
          </Text>
          <Text
            className={`favorites-page__view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => handleViewToggle('list')}
          >
            ☰
          </Text>
        </View>
      </View>

      {/* 内容区 */}
      <ScrollView
        className="favorites-page__scroll"
        scrollY
        onScrollToLower={() => { if (hasMore && !loadingMore) loadMore(); }}
      >
        <View className="favorites-page__content">
          {items.length === 0 ? (
            <Empty description="暂无收藏" />
          ) : viewMode === 'list' ? (
            /* 列表视图 */
            <View className="favorites-page__list-view">
              {items.map((item) => (
                <View key={item.id} className="favorites-page__list-item">
                  <Cell
                    className="favorites-page__cell"
                    title={
                      <View className="favorites-page__cell-title">
                        <Text className="favorites-page__cell-emoji">
                          {TARGET_TYPE_EMOJIS[item.targetType] || '📎'}
                        </Text>
                        <View className="favorites-page__cell-info">
                          <Text className="favorites-page__cell-name">{item.targetName}</Text>
                          <Text className="favorites-page__cell-meta">
                            {TARGET_TYPE_LABELS[item.targetType] || '未知'} · {item.ownerName} · {formatFileSize(item.targetSize)}
                          </Text>
                        </View>
                      </View>
                    }
                    description={item.createTime?.slice(0, 10)}
                    onClick={() => handleItemClick(item)}
                    extra={
                      <Text
                        className="favorites-page__remove-btn"
                        onClick={(e) => handleRemoveFavorite(item, e)}
                      >
                        {removingId === item.id ? '...' : '取消收藏'}
                      </Text>
                    }
                  />
                </View>
              ))}
            </View>
          ) : (
            /* 图标视图 */
            items.map((item) => (
              <View
                key={item.id}
                className="favorites-page__card-item"
                onClick={() => handleItemClick(item)}
              >
                <View className="favorites-page__card-top">
                  <Text className="favorites-page__card-emoji">
                    {TARGET_TYPE_EMOJIS[item.targetType] || '📎'}
                  </Text>
                  <View className="favorites-page__card-info">
                    <Text className="favorites-page__card-name">{item.targetName}</Text>
                    <Text className="favorites-page__card-meta">
                      {TARGET_TYPE_LABELS[item.targetType] || '未知'} · {item.ownerName}
                    </Text>
                    <Text className="favorites-page__card-meta">
                      {formatFileSize(item.targetSize)} · {item.createTime?.slice(0, 10)}
                    </Text>
                  </View>
                </View>
                <View className="favorites-page__card-bottom">
                  <Text
                    className="favorites-page__remove-btn"
                    onClick={(e) => handleRemoveFavorite(item, e)}
                  >
                    {removingId === item.id ? '...' : '取消收藏'}
                  </Text>
                </View>
              </View>
            ))
          )}

          {loadingMore && (
            <View className="favorites-page__loading-more"><Loading>加载更多...</Loading></View>
          )}
          {!hasMore && items.length > 0 && (
            <View className="favorites-page__no-more"><Text>— 没有更多了 —</Text></View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default FavoritesPage;
