import { View, Text, Image } from '@tarojs/components';
import { useDidShow, getCurrentInstance } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, Button } from '@nutui/nutui-react-taro';
import { getShareContents } from '../../utils/api';
import type { FileInfo } from '../../utils/api';
import './index.scss';

interface ShareContentProps {}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ShareContentPage(_props: ShareContentProps): JSX.Element {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharePerm, setSharePerm] = useState(1);

  const params = getCurrentInstance().router?.params as {
    shareId?: string;
    fileId?: string;
  };

  useDidShow(() => {
    loadData();
  });

  const loadData = useCallback(async () => {
    if (!params?.shareId) return;
    setLoading(true);
    try {
      const res = await getShareContents(Number(params.shareId));
      setFiles(res?.list || []);
    } catch {
      // 已在 request 中处理
    } finally {
      setLoading(false);
    }
  }, [params?.shareId]);

  const handlePreview = useCallback((file: FileInfo) => {
    if (file.mimeType?.startsWith('image/')) {
      Taro.previewImage({
        urls: [`http://localhost:8080/api/media/thumbnail/${file.id}`],
      });
    } else if (file.mimeType?.startsWith('video/')) {
      Taro.navigateTo({ url: `/pages/share-content/index?fileId=${file.id}` });
    } else {
      Taro.showToast({ title: '暂不支持预览', icon: 'none' });
    }
  }, []);

  return (
    <View className="share-content-page">
      {loading ? (
        <View className="share-content-page__loading">
          <Loading>加载中...</Loading>
        </View>
      ) : (
        <View className="share-content-page__content">
          <View className="share-content-page__header">
            <Text className="share-content-page__title">
              分享内容 ({files.length})
            </Text>
            {sharePerm === 2 && (
              <Button size="small" type="primary">
                上传
              </Button>
            )}
          </View>

          {files.length === 0 ? (
            <Empty description="暂无分享内容" />
          ) : (
            files.map((file) => (
              <View
                key={file.id}
                className="share-content-page__file-item"
                onClick={() => handlePreview(file)}
              >
                <View className="share-content-page__file-icon">
                  {file.mimeType?.startsWith('image/') ? (
                    <Image
                      className="share-content-page__file-thumb"
                      src={`http://localhost:8080/api/media/thumbnail/${file.id}`}
                      mode="aspectFill"
                    />
                  ) : (
                    <Text className="share-content-page__file-emoji">
                      {file.mimeType?.startsWith('video/') ? '🎬' : '📄'}
                    </Text>
                  )}
                </View>
                <View className="share-content-page__file-info">
                  <Text className="share-content-page__file-name">
                    {file.fileName}
                  </Text>
                  <Text className="share-content-page__file-meta">
                    {formatFileSize(file.fileSize)} · {file.createTime?.slice(0, 10)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default ShareContentPage;
