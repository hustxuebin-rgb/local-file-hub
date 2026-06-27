import { View, Text, Image, Input, ScrollView } from '@tarojs/components';
import { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { useState, useCallback, useEffect, useRef } from 'react';
import Taro from '@tarojs/taro';
import { Button, Loading, Empty, Dialog, ActionSheet, Cell, Checkbox } from '@nutui/nutui-react-taro';
import useAuthStore from '../../stores/authStore';
import {
  listFolders,
  listFiles,
  createFolder,
  getServerInfo,
  addFavorite,
  removeFavorite,
  listFavorites,
} from '../../utils/api';
import type { Folder, FileInfo, ServerInfo, FavoriteItem } from '../../utils/api';
import './index.scss';

const STORAGE_VIEW_MODE_KEY = 'index_view_mode';

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

function getFileTypeEmoji(file: FileInfo): string {
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

interface IndexProps {}

function IndexPage(_props: IndexProps): JSX.Element {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<number | undefined>(undefined);
  const [breadcrumb, setBreadcrumb] = useState<{ id?: number; name: string }[]>([{ name: '根目录' }]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [serverOnline, setServerOnline] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const { user, isLoggedIn } = useAuthStore();

  // 搜索/排序/视图
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (Taro.getStorageSync(STORAGE_VIEW_MODE_KEY) as 'grid' | 'list') || 'grid',
  );
  const [showSortSheet, setShowSortSheet] = useState(false);

  // 多选
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 收藏
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getServerInfo()
      .then((info) => { setServerOnline(true); setServerInfo(info); })
      .catch(() => { setServerOnline(false); setServerInfo(null); });
  }, []);

  useDidShow(() => {
    if (!isLoggedIn && !Taro.getStorageSync('token')) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
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
      const [folderList, fileList] = await Promise.all([
        listFolders(currentFolderId),
        listFiles({
          folderId: currentFolderId,
          keyword: searchKeyword || undefined,
          sortBy,
          sortOrder,
          page: pageNum,
          pageSize: 20,
        }),
      ]);
      if (pageNum === 1) {
        setFolders(folderList || []);
        setFiles(fileList?.list || []);
      } else {
        setFiles((prev) => [...prev, ...(fileList?.list || [])]);
      }
      setHasMore((fileList?.list || []).length >= 20);
      setPage(pageNum);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentFolderId, searchKeyword, sortBy, sortOrder]);

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

  const handleFolderClick = useCallback((folder: Folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.folderName }]);
    setPage(1);
    setHasMore(true);
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBack = useCallback(() => {
    if (breadcrumb.length <= 1) return;
    const newBreadcrumb = breadcrumb.slice(0, -1);
    setBreadcrumb(newBreadcrumb);
    const parent = newBreadcrumb[newBreadcrumb.length - 1];
    setCurrentFolderId(parent.id);
    setPage(1);
    setHasMore(true);
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }, [breadcrumb]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      Taro.showToast({ title: '请输入文件夹名称', icon: 'none' });
      return;
    }
    try {
      await createFolder({ parentId: currentFolderId, folderName: newFolderName.trim() });
      setShowCreateDialog(false);
      setNewFolderName('');
      Taro.showToast({ title: '创建成功', icon: 'success' });
      loadData(1);
    } catch { /* toast handled in request */ }
  }, [newFolderName, currentFolderId, loadData]);

  const handleFilePreview = useCallback((file: FileInfo) => {
    const isImage = file.mimeType?.startsWith('image/');
    const isVideo = file.mimeType?.startsWith('video/');
    if (isImage || isVideo) {
      Taro.navigateTo({ url: `/pages/share-content/index?fileId=${file.id}` });
    } else {
      Taro.showToast({ title: '暂不支持预览该类型文件', icon: 'none' });
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

  const handleToggleSelect = useCallback((fileId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  }, [files, selectedIds]);

  const handleEnterMultiSelect = useCallback(() => {
    setMultiSelectMode(true);
    setSelectedIds(new Set());
  }, []);

  const handleExitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBatchShare = useCallback(() => {
    if (selectedIds.size === 0) {
      Taro.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }
    // 跳转到 create-share 页面，传递选中文件ID
    const ids = Array.from(selectedIds).join(',');
    Taro.navigateTo({ url: `/pages/create-share/index?fileIds=${ids}` });
    setMultiSelectMode(false);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.sortBy === sortBy && o.sortOrder === sortOrder)?.label || '名称 ↑';

  // ---- 渲染辅助 ----

  const renderFileIcon = (file: FileInfo) => {
    if (viewMode === 'list') {
      return <Text className="index-page__file-emoji">{getFileTypeEmoji(file)}</Text>;
    }
    if (file.mimeType?.startsWith('image/')) {
      return (
        <Image
          className="index-page__file-thumb"
          src={`http://localhost:8080/api/media/thumbnail/${file.id}`}
          mode="aspectFill"
        />
      );
    }
    return <Text className="index-page__file-emoji">{getFileTypeEmoji(file)}</Text>;
  };

  return (
    <View className="index-page">
      {/* Server 连接状态条 */}
      <View className={`index-page__status-bar ${serverOnline ? 'connected' : 'disconnected'}`}>
        <Text className="index-page__status-dot">{serverOnline ? '🟢' : '🔴'}</Text>
        <Text className="index-page__status-text">
          {serverOnline
            ? `已连接: local-file-hub Server${serverInfo?.local_ip ? ` (${serverInfo.local_ip})` : ''}`
            : '未连接: local-file-hub Server'}
        </Text>
      </View>

      {/* 搜索栏 */}
      <View className="index-page__search-bar">
        <View className="index-page__search-input-wrap">
          <Text className="index-page__search-icon">🔍</Text>
          <Input
            className="index-page__search-input"
            placeholder="搜索文件..."
            value={searchKeyword}
            onInput={(e) => handleSearch(e.detail.value)}
            onConfirm={() => { setPage(1); setHasMore(true); loadData(1); }}
            confirmType="search"
          />
          {searchKeyword && (
            <Text
              className="index-page__search-clear"
              onClick={() => { setSearchKeyword(''); setPage(1); setHasMore(true); loadData(1); }}
            >
              ✕
            </Text>
          )}
        </View>
      </View>

      {/* 快速入口 */}
      <View className="index-page__quick-nav">
        <View className="index-page__quick-nav-item" onClick={() => Taro.navigateTo({ url: '/pages/favorites/index' })}>
          <Text className="index-page__quick-nav-icon">⭐</Text>
          <Text className="index-page__quick-nav-label">收藏</Text>
        </View>
        <View className="index-page__quick-nav-item" onClick={() => Taro.navigateTo({ url: '/pages/operation-logs/index' })}>
          <Text className="index-page__quick-nav-icon">📋</Text>
          <Text className="index-page__quick-nav-label">记录</Text>
        </View>
        <View className="index-page__quick-nav-item" onClick={() => Taro.navigateTo({ url: '/pages/storage-stats/index' })}>
          <Text className="index-page__quick-nav-icon">📊</Text>
          <Text className="index-page__quick-nav-label">统计</Text>
        </View>
      </View>

      {/* 工具栏：排序 + 视图切换 + 多选 */}
      <View className="index-page__toolbar">
        <Button size="small" className="index-page__toolbar-btn" onClick={() => setShowSortSheet(true)}>
          {currentSortLabel}
        </Button>
        <View className="index-page__toolbar-right">
          <View className="index-page__view-toggle">
            <Text
              className={`index-page__view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleViewToggle('grid')}
            >
              ▦
            </Text>
            <Text
              className={`index-page__view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => handleViewToggle('list')}
            >
              ☰
            </Text>
          </View>
          {!multiSelectMode ? (
            <Button size="small" className="index-page__toolbar-btn" onClick={handleEnterMultiSelect}>
              多选
            </Button>
          ) : (
            <Button size="small" className="index-page__toolbar-btn index-page__toolbar-btn--cancel" onClick={handleExitMultiSelect}>
              取消
            </Button>
          )}
        </View>
      </View>

      {/* 顶部导航：面包屑 */}
      <View className="index-page__nav">
        <View className="index-page__breadcrumb">
          {breadcrumb.map((item, index) => (
            <Text
              key={index}
              className={`index-page__breadcrumb-item ${index === breadcrumb.length - 1 ? 'active' : ''}`}
              onClick={() => {
                if (index < breadcrumb.length - 1) {
                  const newBreadcrumb = breadcrumb.slice(0, index + 1);
                  setBreadcrumb(newBreadcrumb);
                  setCurrentFolderId(item.id);
                  setPage(1);
                  setHasMore(true);
                  setMultiSelectMode(false);
                  setSelectedIds(new Set());
                }
              }}
            >
              {index > 0 ? ' / ' : ''}{item.name}
            </Text>
          ))}
        </View>
        <Button size="small" className="index-page__add-btn" onClick={() => setShowCreateDialog(true)}>
          + 新建
        </Button>
      </View>

      {/* 内容区域 */}
      <ScrollView
        className="index-page__scroll"
        scrollY
        onScrollToLower={() => { if (hasMore && !loadingMore && !loading) loadMore(); }}
      >
        {loading ? (
          <View className="index-page__loading"><Loading>加载中...</Loading></View>
        ) : (
          <View className="index-page__content">
            {/* 多选时全选栏 */}
            {multiSelectMode && files.length > 0 && (
              <View className="index-page__select-all-bar">
                <Checkbox
                  checked={selectedIds.size === files.length && files.length > 0}
                  onChange={handleSelectAll}
                >
                  全选 ({selectedIds.size}/{files.length})
                </Checkbox>
              </View>
            )}

            {/* 文件夹列表 */}
            {folders.length > 0 && (
              <View className="index-page__section">
                <Text className="index-page__section-title">文件夹</Text>
                <View className="index-page__folder-list">
                  {folders.map((folder) => (
                    <View
                      key={folder.id}
                      className="index-page__folder-item"
                      onClick={() => handleFolderClick(folder)}
                    >
                      <Text className="index-page__folder-icon">📁</Text>
                      <Text className="index-page__folder-name">{folder.folderName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 文件列表 */}
            <View className="index-page__section">
              <Text className="index-page__section-title">文件</Text>
              {files.length === 0 ? (
                <Empty description="暂无文件" />
              ) : viewMode === 'list' ? (
                /* 列表视图 */
                <View className="index-page__file-list-view">
                  {files.map((file) => (
                    <View
                      key={file.id}
                      className={`index-page__file-list-item ${multiSelectMode && selectedIds.has(file.id) ? 'selected' : ''}`}
                      onClick={() => multiSelectMode ? handleToggleSelect(file.id) : handleFilePreview(file)}
                    >
                      {multiSelectMode && (
                        <Checkbox
                          className="index-page__file-checkbox"
                          checked={selectedIds.has(file.id)}
                          onChange={() => handleToggleSelect(file.id)}
                        />
                      )}
                      <Cell
                        className="index-page__file-cell"
                        title={
                          <View className="index-page__file-cell-title">
                            {renderFileIcon(file)}
                            <Text className="index-page__file-cell-name">{file.fileName}</Text>
                          </View>
                        }
                        description={`${formatFileSize(file.fileSize)} · ${file.createTime?.slice(0, 10)}`}
                        onClick={
                          multiSelectMode
                            ? () => handleToggleSelect(file.id)
                            : () => handleFilePreview(file)
                        }
                        extra={
                          <Text
                            className={`index-page__favorite-btn ${favoriteIds.has(file.id) ? 'favorited' : ''}`}
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
                /* 图标视图 */
                files.map((file) => (
                  <View
                    key={file.id}
                    className={`index-page__file-item ${multiSelectMode ? 'multi-select' : ''} ${selectedIds.has(file.id) ? 'selected' : ''}`}
                    onClick={() => multiSelectMode ? handleToggleSelect(file.id) : handleFilePreview(file)}
                  >
                    {multiSelectMode && (
                      <Checkbox
                        className="index-page__file-checkbox"
                        checked={selectedIds.has(file.id)}
                        onChange={() => handleToggleSelect(file.id)}
                      />
                    )}
                    <View className="index-page__file-icon">{renderFileIcon(file)}</View>
                    <View className="index-page__file-info">
                      <Text className="index-page__file-name">{file.fileName}</Text>
                      <Text className="index-page__file-meta">
                        {formatFileSize(file.fileSize)} · {file.createTime?.slice(0, 10)}
                      </Text>
                    </View>
                    {!multiSelectMode && (
                      <Text
                        className={`index-page__favorite-btn ${favoriteIds.has(file.id) ? 'favorited' : ''}`}
                        onClick={(e) => handleToggleFavorite(file.id, e)}
                      >
                        {favoriteIds.has(file.id) ? '⭐' : '☆'}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>

            {/* 加载更多 */}
            {loadingMore && (
              <View className="index-page__loading-more"><Loading>加载更多...</Loading></View>
            )}
            {!hasMore && files.length > 0 && (
              <View className="index-page__no-more"><Text>— 没有更多了 —</Text></View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 多选底部操作栏 */}
      {multiSelectMode && (
        <View className="index-page__bottom-bar">
          <Button
            className="index-page__bottom-btn index-page__bottom-btn--share"
            onClick={handleBatchShare}
            disabled={selectedIds.size === 0}
          >
            批量分享({selectedIds.size})
          </Button>
        </View>
      )}

      {/* 排序选择器 */}
      <ActionSheet
        visible={showSortSheet}
        options={SORT_OPTIONS}
        onSelect={(item) => handleSortSelect(item as typeof SORT_OPTIONS[0])}
        onCancel={() => setShowSortSheet(false)}
        cancelText="取消"
      />

      {/* 新建文件夹对话框 */}
      <Dialog
        title="新建文件夹"
        visible={showCreateDialog}
        onConfirm={handleCreateFolder}
        onCancel={() => { setShowCreateDialog(false); setNewFolderName(''); }}
        confirmText="确定"
        cancelText="取消"
      >
        <View className="index-page__dialog-input">
          <Input
            className="index-page__input-field"
            placeholder="请输入文件夹名称"
            value={newFolderName}
            onInput={(e) => setNewFolderName(e.detail.value)}
            maxlength={50}
          />
        </View>
      </Dialog>
    </View>
  );
}

export default IndexPage;
