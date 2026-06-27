import { View, Text, Input, ScrollView } from '@tarojs/components';
import { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { useState, useCallback, useEffect, useRef } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, Cell, ActionSheet } from '@nutui/nutui-react-taro';
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

const SORT_OPTIONS: { label: string; sortBy: string; sortOrder: string }[] = [
  { label: '时间 ↓', sortBy: 'createTime', sortOrder: 'desc' },
  { label: '时间 ↑', sortBy: 'createTime', sortOrder: 'asc' },
  { label: '名称 ↑', sortBy: 'targetName', sortOrder: 'asc' },
  { label: '名称 ↓', sortBy: 'targetName', sortOrder: 'desc' },
  { label: '大小 ↓', sortBy: 'targetSize', sortOrder: 'desc' },
  { label: '大小 ↑', sortBy: 'targetSize', sortOrder: 'asc' },
];

const FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: '全部', value: '' },
  { label: '📄 文件', value: '1' },
  { label: '📁 文件夹', value: '2' },
  { label: '🔗 分享', value: '3' },
];

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
  const [keyword, setKeyword] = useState('');
  const [targetType, setTargetType] = useState<number | undefined>(undefined);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [sortBy, setSortBy] = useState('createTime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const [searchTrigger, setSearchTrigger] = useState(0);

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

  // 响应式数据加载：当筛选/排序/搜索条件变化时自动重新加载
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setPage(1);
    setHasMore(true);
    loadData(1);
  }, [sortBy, sortOrder, targetType, keyword, searchTrigger]);

  const loadData = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await listFavorites({
        page: pageNum,
        pageSize: 20,
        keyword: keyword || undefined,
        targetType,
      });
      let list = res?.list || [];
      // 客户端排序
      const dir = sortOrder === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        if (sortBy === 'createTime') {
          return dir * (new Date(a.createTime).getTime() - new Date(b.createTime).getTime());
        }
        if (sortBy === 'targetName') {
          return dir * a.targetName.localeCompare(b.targetName);
        }
        if (sortBy === 'targetSize') {
          return dir * (a.targetSize - b.targetSize);
        }
        return 0;
      });
      if (pageNum === 1) {
        setItems(list);
      } else {
        setItems((prev) => [...prev, ...list]);
      }
      setHasMore(list.length >= 20);
      setPage(pageNum);
    } catch {
      // handled in request
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [keyword, targetType, sortBy, sortOrder]);

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

  const handleSearch = useCallback((value: string) => {
    setKeyword(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchTrigger((v) => v + 1);
    }, 500);
  }, []);

  const handleSortSelect = useCallback((item: { label: string; sortBy: string; sortOrder: string }) => {
    setSortBy(item.sortBy);
    setSortOrder(item.sortOrder);
    setShowSortSheet(false);
  }, []);

  const handleFilterSelect = useCallback((item: { label: string; value: string }) => {
    const newTargetType = item.value ? Number(item.value) : undefined;
    setTargetType(newTargetType);
    setShowFilterSheet(false);
  }, []);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.sortBy === sortBy && o.sortOrder === sortOrder)?.label || '时间 ↓';

  const currentFilterLabel = FILTER_OPTIONS.find((o) => o.value === String(targetType ?? ''))?.label || '全部';

  if (loading) {
    return (
      <View className="favorites-page">
        <View className="favorites-page__loading"><Loading>加载中...</Loading></View>
      </View>
    );
  }

  return (
    <View className="favorites-page">
      {/* 搜索栏 */}
      <View className="favorites-page__search-bar">
        <View className="favorites-page__search-input-wrap">
          <Text className="favorites-page__search-icon">🔍</Text>
          <Input
            className="favorites-page__search-input"
            placeholder="搜索收藏..."
            value={keyword}
            onInput={(e) => handleSearch(e.detail.value)}
            onConfirm={() => { setSearchTrigger((v) => v + 1); }}
            confirmType="search"
          />
          {keyword && (
            <Text
              className="favorites-page__search-clear"
              onClick={() => { setKeyword(''); }}
            >
              ✕
            </Text>
          )}
        </View>
      </View>

      {/* 工具栏 */}
      <View className="favorites-page__toolbar">
        <View className="favorites-page__toolbar-left">
          <View
            className="favorites-page__filter-btn"
            onClick={() => setShowFilterSheet(true)}
          >
            <Text>{currentFilterLabel}</Text>
            <Text className="favorites-page__filter-arrow">▾</Text>
          </View>
          <View
            className="favorites-page__sort-btn"
            onClick={() => setShowSortSheet(true)}
          >
            <Text>{currentSortLabel}</Text>
            <Text className="favorites-page__sort-arrow">▾</Text>
          </View>
        </View>
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

      {/* 排序选择器 */}
      <ActionSheet
        visible={showSortSheet}
        options={SORT_OPTIONS}
        onSelect={(item) => handleSortSelect(item as typeof SORT_OPTIONS[0])}
        onCancel={() => setShowSortSheet(false)}
        cancelText="取消"
      />

      {/* 分类筛选器 */}
      <ActionSheet
        visible={showFilterSheet}
        options={FILTER_OPTIONS}
        onSelect={(item) => handleFilterSelect(item as unknown as typeof FILTER_OPTIONS[0])}
        onCancel={() => setShowFilterSheet(false)}
        cancelText="取消"
      />
    </View>
  );
}

export default FavoritesPage;
