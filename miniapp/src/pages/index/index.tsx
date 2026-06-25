import { View, Text, Image, Input } from '@tarojs/components';
import { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useState, useCallback, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { Button, Loading, Empty, Dialog } from '@nutui/nutui-react-taro';
import useAuthStore from '../../stores/authStore';
import { listFolders, listFiles, createFolder, getServerInfo } from '../../utils/api';
import type { Folder, FileInfo, ServerInfo } from '../../utils/api';
import './index.scss';

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

  useEffect(() => {
    getServerInfo()
      .then((info) => {
        setServerOnline(true);
        setServerInfo(info);
      })
      .catch(() => {
        setServerOnline(false);
        setServerInfo(null);
      });
  }, []);

  useDidShow(() => {
    if (!isLoggedIn && !Taro.getStorageSync('token')) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    loadData();
  });

  usePullDownRefresh(async () => {
    await loadData();
    Taro.stopPullDownRefresh();
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [folderList, fileList] = await Promise.all([
        listFolders(currentFolderId),
        listFiles({ folderId: currentFolderId, page: 1, pageSize: 50 }),
      ]);
      setFolders(folderList || []);
      setFiles(fileList?.list || []);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  const handleFolderClick = useCallback((folder: Folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.folderName }]);
  }, []);

  const handleBack = useCallback(() => {
    if (breadcrumb.length <= 1) return;
    const newBreadcrumb = breadcrumb.slice(0, -1);
    setBreadcrumb(newBreadcrumb);
    const parent = newBreadcrumb[newBreadcrumb.length - 1];
    setCurrentFolderId(parent.id);
  }, [breadcrumb]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      Taro.showToast({ title: '请输入文件夹名称', icon: 'none' });
      return;
    }
    try {
      await createFolder({
        parentId: currentFolderId,
        folderName: newFolderName.trim(),
      });
      setShowCreateDialog(false);
      setNewFolderName('');
      Taro.showToast({ title: '创建成功', icon: 'success' });
      loadData();
    } catch (err) {
      // toast 已在 request 中处理
    }
  }, [newFolderName, currentFolderId, loadData]);

  const handleFilePreview = useCallback((file: FileInfo) => {
    const isImage = file.mimeType?.startsWith('image/');
    const isVideo = file.mimeType?.startsWith('video/');
    if (isImage || isVideo) {
      Taro.navigateTo({
        url: `/pages/share-content/index?fileId=${file.id}`,
      });
    } else {
      Taro.showToast({ title: '暂不支持预览该类型文件', icon: 'none' });
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

      {/* 顶部导航 */}
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
                }
              }}
            >
              {index > 0 ? ' / ' : ''}{item.name}
            </Text>
          ))}
        </View>
        <Button
          size="small"
          className="index-page__add-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          + 新建
        </Button>
      </View>

      {loading ? (
        <View className="index-page__loading">
          <Loading>加载中...</Loading>
        </View>
      ) : (
        <View className="index-page__content">
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
            ) : (
              files.map((file) => (
                <View
                  key={file.id}
                  className="index-page__file-item"
                  onClick={() => handleFilePreview(file)}
                >
                  <View className="index-page__file-icon">
                    {file.mimeType?.startsWith('image/') ? (
                      <Image
                        className="index-page__file-thumb"
                        src={`http://localhost:8080/api/media/thumbnail/${file.id}`}
                        mode="aspectFill"
                      />
                    ) : (
                      <Text className="index-page__file-emoji">
                        {file.mimeType?.startsWith('video/') ? '🎬' : '📄'}
                      </Text>
                    )}
                  </View>
                  <View className="index-page__file-info">
                    <Text className="index-page__file-name">{file.fileName}</Text>
                    <Text className="index-page__file-meta">
                      {formatFileSize(file.fileSize)} · {file.createTime?.slice(0, 10)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      )}

      {/* 新建文件夹对话框 */}
      <Dialog
        title="新建文件夹"
        visible={showCreateDialog}
        onConfirm={handleCreateFolder}
        onCancel={() => {
          setShowCreateDialog(false);
          setNewFolderName('');
        }}
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
