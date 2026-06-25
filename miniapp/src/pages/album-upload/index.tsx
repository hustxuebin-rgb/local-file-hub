import { View, Text, Image } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Button, Loading, Progress } from '@nutui/nutui-react-taro';
import { getApiBaseUrl, STORAGE_KEYS } from '../../utils/config';
import './index.scss';

interface AlbumUploadProps {}

function AlbumUploadPage(_props: AlbumUploadProps): JSX.Element {
  const [mediaList, setMediaList] = useState<{ path: string; size: number; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleChooseMedia = useCallback(async () => {
    try {
      const res = await Taro.chooseMedia({
        count: 9,
        mediaType: ['image', 'video'],
        sourceType: ['album'],
      });
      const items = res.tempFiles.map((file) => ({
        path: file.tempFilePath,
        size: (file as unknown as { size?: number }).size || 0,
        type: file.tempFilePath?.endsWith('.mp4') ? 'video' : 'image',
      }));
      setMediaList(items);
    } catch {
      // 用户取消选择
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (mediaList.length === 0) {
      Taro.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < mediaList.length; i++) {
        await Taro.uploadFile({
          url: `${getApiBaseUrl()}/api/miniapp/album_upload`,
          filePath: mediaList[i].path,
          name: 'file',
          header: {
            Authorization: `Bearer ${Taro.getStorageSync(STORAGE_KEYS.TOKEN)}`,
          },
        });
        setProgress(((i + 1) / mediaList.length) * 100);
      }
      Taro.showToast({ title: '上传成功', icon: 'success' });
      setMediaList([]);
      setProgress(0);
    } catch {
      Taro.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  }, [mediaList]);

  const handleRemoveMedia = useCallback((index: number) => {
    setMediaList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <View className="album-upload-page">
      <View className="album-upload-page__header">
        <Text className="album-upload-page__title">相册上传</Text>
      </View>

      <View className="album-upload-page__content">
        <Button
          className="album-upload-page__choose-btn"
          type="primary"
          block
          onClick={handleChooseMedia}
          disabled={uploading}
        >
          从相册选择文件
        </Button>

        {mediaList.length > 0 && (
          <View className="album-upload-page__preview">
            <Text className="album-upload-page__preview-title">
              已选择 {mediaList.length} 个文件
            </Text>
            <View className="album-upload-page__media-grid">
              {mediaList.map((item, index) => (
                <View key={index} className="album-upload-page__media-item">
                  {item.type === 'image' ? (
                    <Image
                      className="album-upload-page__media-thumb"
                      src={item.path}
                      mode="aspectFill"
                    />
                  ) : (
                    <View className="album-upload-page__media-thumb album-upload-page__media-video">
                      <Text>🎬</Text>
                    </View>
                  )}
                  <Text
                    className="album-upload-page__media-remove"
                    onClick={() => handleRemoveMedia(index)}
                  >
                    ✕
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {uploading && (
          <View className="album-upload-page__progress">
            <Progress percent={progress} />
            <Text className="album-upload-page__progress-text">
              上传中 {Math.round(progress)}%
            </Text>
          </View>
        )}

        {mediaList.length > 0 && (
          <Button
            className="album-upload-page__upload-btn"
            type="primary"
            block
            loading={uploading}
            onClick={handleUpload}
          >
            {uploading ? '上传中...' : `上传 ${mediaList.length} 个文件`}
          </Button>
        )}
      </View>
    </View>
  );
}

export default AlbumUploadPage;
