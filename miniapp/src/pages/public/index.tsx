import { View, Text, Input, ScrollView } from '@tarojs/components';
import { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { useState, useCallback, useRef } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, ActionSheet, Cell } from '@nutui/nutui-react-taro';
import { listPublicFiles, addFavorite, removeFavorite, listFavorites } from '../../utils/api';
import type { PublicFile, FavoriteItem } from '../../utils/api';
import './index.scss';

const STORAGE_VIEW_MODE_KEY = 'public_view_mode';

const SORT_OPTIONS: { label: string; sortBy: string; sortOrder: string }[] = [
  { label: '名称 ↑', sortBy: 'name', sortOrder: 'asc' },
  { label: '名称 ↓', sortBy: 'name', sortOrder: 'desc' },
  { label: '大小 ↑', sortBy: 'size', sortOrder: 'asc' },
  { label: '大小 ↓', sortBy: 'size', sortOrder: 'desc' },
  { label: '类型 ↑', sortBy: 'fileType', sortOrder: 'asc' },
  { label: '类型 ↓', sortBy: 'fileType', sortOrder: 'desc' },
  { label: '时间 ↑', sortBy: 'createTime', sortOrder: 'asc' },
  { label: '时间 ↓', sortBy: 'createTime', sortOrder: 'desc' },
];

function getFileTypeEmoji(file: PublicFile): string {
  if (file.mimeType?.startsWith('image/')) return '🖼️';
  if (file.mimeType?.startsWith('video/')) return '🎬';
  if (file.mimeType?.startsWith('application/zip') || file.mimeType?.startsWith('application/x-rar') ||
      file.mimeType?.startsWith('application/x-7z') || file.fileSuffix === 'zip' || file.fileSuffix === 'rar' || file.fileSuffix === '7z') return '📦';
  if (file.mimeType?.startsWith('application/pdf') || file.mimeType?.startsWith('application/msword') ||
      file.mimeType?.startsWith('application/vnd.') || file.mimeType?.startsWith('text/')) return '📄';
  return '📎';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface PublicProps {}

function PublicPage(_props: PublicProps): JSX.Element {
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState('createTime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (Taro.getStorageSync(STORAGE_VIEW_MODE_KEY) as 'grid' | 'list') || 'grid',
  );
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useDidShow(() => {
    setPage(1);
    setHasMore(true);
    loadData(1);
    loadFavorites();
  });

  usePullDownRefresh(async () => {
    setPage(1);
    setHasMore(true);
    await loadData(1);
    await loadFavorites();
    Taro.stopPullDownRefresh();
  });

  useReachBottom(() => {
    if (!hasMore || loadingMore || loading) return;
    loadMore();
  });

  const loadFavorites = useCallback(async () => {
    try {
      const res = await listFavorites({ page: 1, pageSize: 200 });
      const ids = new Set<number>();
      (res?.list || []).forEach((fav: FavoriteItem) => {
        if (fav.targetType === 1) ids.add(fav.targetId);
      });
      setFavoriteIds(ids);
    } catch { /* ignore */ }
  }, []);

  const loadData = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await listPublicFiles({
        keyword: searchKeyword || undefined,
        sortBy,
        sortOrder,
        page: pageNum,
        pageSize: 20,
      });
      if (pageNum === 1) {
        setFiles(res?.list || []);
      } else {
        setFiles((prev) => [...prev, ...(res?.list || [])]);
      }
      setHasMore((res?.list || []).length >= 20);
      setPage(pageNum);
    } catch {
      // 已在 request 中处理
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchKeyword, sortBy, sortOrder]);

  const loadMore = useCallback(() => {
    loadData(page + 1);
  }, [page, loadData]);

  const handleSearch = useCallback((value: string) => {
    setSearchKeyword(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      loadData(1);
    }, 500);
  }, [loadData]);

  const handleSortSelect = useCallback((item: { label: string; sortBy: string; sortOrder: string }) => {
    setSortBy(item.sortBy);
    setSortOrder(item.sortOrder);
    setShowSortSheet(false);
    setPage(1);
    setHasMore(true);
    loadData(1);
  }, [loadData]);

  const handleViewToggle = useCallback((mode: 'grid' | 'list') => {
    setViewMode(mode);
    Taro.setStorageSync(STORAGE_VIEW_MODE_KEY, mode);
  }, []);

  const handlePreview = useCallback((file: PublicFile) => {
    if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) {
      Taro.navigateTo({ url: `/pages/share-content/index?fileId=${file.id}` });
    } else {
      Taro.showToast({ title: '暂不支持预览', icon: 'none' });
    }
  }, []);

  const handleToggleFavorite = useCallback(async (fileId: number, e?: any) => {
    if (e) e.stopPropagation();
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      if (favoriteIds.has(fileId)) {
        await removeFavorite({ targetType: 1, targetId: fileId });
        setFavoriteIds((prev) => { const next = new Set(prev); next.delete(fileId); return next; });
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
      } else {
        await addFavorite({ targetType: 1, targetId: fileId });
        setFavoriteIds((prev) => new Set(prev).add(fileId));
        Taro.showToast({ title: '已收藏', icon: 'success' });
      }
    } catch { /* handled in request */ }
    finally { setFavoriteLoading(false); }
  }, [favoriteIds, favoriteLoading]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.sortBy === sortBy && o.sortOrder === sortOrder)?.label || '时间 ↓';

  return (
    <View className="public-page">
      {/* 搜索栏 */}
      <View className="public-page__search-bar">
        <View className="public-page__search-input-wrap">
          <Text className="public-page__search-icon">🔍</Text>
          <Input
            className="public-page__search-input"
            placeholder="搜索公共文件..."
            value={searchKeyword}
            onInput={(e) => handleSearch(e.detail.value)}
            onConfirm={() => { setPage(1); setHasMore(true); loadData(1); }}
            confirmType="search"
          />
          {searchKeyword && (
            <Text
              className="public-page__search-clear"
              onClick={() => { setSearchKeyword(''); setPage(1); setHasMore(true); loadData(1); }}
            >
              ✕
            </Text>
          )}
        </View>
      </View>

      {/* 工具栏 */}
      <View className="public-page__toolbar">
        <View
          className="public-page__sort-btn"
          onClick={() => setShowSortSheet(true)}
        >
          <Text>{currentSortLabel}</Text>
        </View>
        <View className="public-page__view-toggle">
          <Text
            className={`public-page__view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleViewToggle('grid')}
          >
            ▦
          </Text>
          <Text
            className={`public-page__view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => handleViewToggle('list')}
          >
            ☰
          </Text>
        </View>
      </View>

      {/* 内容区 */}
      <ScrollView
        className="public-page__scroll"
        scrollY
        onScrollToLower={() => { if (hasMore && !loadingMore && !loading) loadMore(); }}
      >
        {loading ? (
          <View className="public-page__loading">
            <Loading>加载中...</Loading>
          </View>
        ) : (
          <View className="public-page__content">
            {files.length === 0 ? (
              <Empty description="暂无公共文件" />
            ) : viewMode === 'list' ? (
              <View className="public-page__file-list-view">
                {files.map((file) => (
                  <View
                    key={file.id}
                    className="public-page__file-list-item"
                  >
                    <Cell
                      className="public-page__file-cell"
                      title={
                        <View className="public-page__file-cell-title">
                          <Text className="public-page__file-emoji-small">{getFileTypeEmoji(file)}</Text>
                          <Text className="public-page__file-cell-name">{file.fileName}</Text>
                        </View>
                      }
                      description={
                        `上传者: ${file.uploaderName || '未知'} · ${formatFileSize(file.fileSize)} · ${file.createTime?.slice(0, 10)}`
                      }
                      onClick={() => handlePreview(file)}
                      extra={
                        <Text
                          className={`public-page__favorite-btn ${favoriteIds.has(file.id) ? 'favorited' : ''}`}
                          onClick={(e) => handleToggleFavorite(file.id, e)}
                        >
                          {favoriteIds.has(file.id) ? '⭐' : '☆'}
                        </Text>
                      }
                    />
                  </View>
                ))}
              </View>
            ) : (
              files.map((file) => (
                <View
                  key={file.id}
                  className="public-page__file-item"
                  onClick={() => handlePreview(file)}
                >
                  <Text className="public-page__file-icon">{getFileTypeEmoji(file)}</Text>
                  <View className="public-page__file-info">
                    <Text className="public-page__file-name">{file.fileName}</Text>
                    <Text className="public-page__file-meta">
                      {file.uploaderName || '未知'} · {formatFileSize(file.fileSize)} · {file.createTime?.slice(0, 10)}
                    </Text>
                  </View>
                  <Text
                    className={`public-page__favorite-btn ${favoriteIds.has(file.id) ? 'favorited' : ''}`}
                    onClick={(e) => handleToggleFavorite(file.id, e)}
                  >
                    {favoriteIds.has(file.id) ? '⭐' : '☆'}
                  </Text>
                </View>
              ))
            )}
            {loadingMore && (
              <View className="public-page__loading-more"><Loading>加载更多...</Loading></View>
            )}
            {!hasMore && files.length > 0 && (
              <View className="public-page__no-more"><Text>— 没有更多了 —</Text></View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 排序选择器 */}
      <ActionSheet
        visible={showSortSheet}
        options={SORT_OPTIONS}
        onSelect={(item) => handleSortSelect(item as typeof SORT_OPTIONS[0])}
        onCancel={() => setShowSortSheet(false)}
        cancelText="取消"
      />
    </View>
  );
}

export default PublicPage;
