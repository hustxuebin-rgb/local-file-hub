import { View, Text } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading } from '@nutui/nutui-react-taro';
import { listFiles } from '../../utils/api';
import type { FileInfo } from '../../utils/api';
import './index.scss';

interface PublicProps {}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function PublicPage(_props: PublicProps): JSX.Element {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useDidShow(() => {
    loadData();
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFiles({ page: 1, pageSize: 50 });
      setFiles(res?.list || []);
    } catch {
      // 已在 request 中处理
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreview = useCallback((file: FileInfo) => {
    if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) {
      Taro.navigateTo({ url: `/pages/share-content/index?fileId=${file.id}` });
    } else {
      Taro.showToast({ title: '暂不支持预览', icon: 'none' });
    }
  }, []);

  return (
    <View className="public-page">
      {loading ? (
        <View className="public-page__loading">
          <Loading>加载中...</Loading>
        </View>
      ) : (
        <View className="public-page__content">
          {files.length === 0 ? (
            <Empty description="暂无公共文件" />
          ) : (
            files.map((file) => (
              <View
                key={file.id}
                className="public-page__file-item"
                onClick={() => handlePreview(file)}
              >
                <Text className="public-page__file-icon">
                  {file.mimeType?.startsWith('image/') ? '🖼️' : file.mimeType?.startsWith('video/') ? '🎬' : '📄'}
                </Text>
                <View className="public-page__file-info">
                  <Text className="public-page__file-name">{file.fileName}</Text>
                  <Text className="public-page__file-meta">
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

export default PublicPage;
