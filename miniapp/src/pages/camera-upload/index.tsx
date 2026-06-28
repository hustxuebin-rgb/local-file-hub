import { View, Text, Image } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Button, Progress } from '@nutui/nutui-react-taro';
import { getApiBaseUrl, STORAGE_KEYS } from '../../utils/config';
import { chunkedUpload } from '../../utils/upload';
import './index.scss';

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB

interface CameraUploadProps {}

interface MediaItem {
  path: string;
  size: number;
  type: string;
}

function CameraUploadPage(_props: CameraUploadProps): JSX.Element {
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chunkInfo, setChunkInfo] = useState('');

  const handleTakePhoto = useCallback(async () => {
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image', 'video'],
        sourceType: ['camera'],
      });
      const file = res.tempFiles[0];
      setMedia({
        path: file.tempFilePath,
        size: (file as unknown as { size?: number }).size || 0,
        type: file.tempFilePath?.endsWith('.mp4') ? 'video' : 'image',
      });
    } catch {
      // 用户取消
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!media) {
      Taro.showToast({ title: '请先拍照', icon: 'none' });
      return;
    }
    setUploading(true);
    setProgress(0);
    setChunkInfo('');

    const token: string = Taro.getStorageSync(STORAGE_KEYS.TOKEN);
    const fileName = media.path.split('/').pop() || 'photo';

    try {
      if (media.size >= LARGE_FILE_THRESHOLD) {
        // 大文件：分片上传
        await chunkedUpload({
          filePath: media.path,
          fileName,
          fileSize: media.size,
          token,
          onProgress: (percent: number, currentChunk: number, totalChunks: number) => {
            setProgress(percent);
            setChunkInfo(`上传中：第 ${currentChunk}/${totalChunks} 片`);
          },
        });
      } else {
        // 小文件：保持现有简单上传
        await Taro.uploadFile({
          url: `${getApiBaseUrl()}/api/miniapp/camera_upload`,
          filePath: media.path,
          name: 'file',
          header: {
            Authorization: `Bearer ${token}`,
          },
        });
        setProgress(100);
      }

      Taro.showToast({ title: '上传成功', icon: 'success' });
      setMedia(null);
      setProgress(0);
      setChunkInfo('');
    } catch {
      Taro.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  }, [media]);

  return (
    <View className="camera-upload-page">
      <View className="camera-upload-page__header">
        <Text className="camera-upload-page__title">拍照上传</Text>
      </View>

      <View className="camera-upload-page__content">
        <Button
          className="camera-upload-page__capture-btn"
          type="primary"
          block
          onClick={handleTakePhoto}
          disabled={uploading}
        >
          拍照
        </Button>

        {media && (
          <View className="camera-upload-page__preview">
            <Text className="camera-upload-page__preview-title">预览</Text>
            {media.type === 'image' ? (
              <Image
                className="camera-upload-page__preview-image"
                src={media.path}
                mode="aspectFit"
              />
            ) : (
              <View className="camera-upload-page__preview-video">
                <Text>🎬 视频</Text>
              </View>
            )}
          </View>
        )}

        {uploading && (
          <View className="camera-upload-page__progress">
            <Progress percent={progress} />
            <Text className="camera-upload-page__progress-text">
              上传中 {Math.round(progress)}%
            </Text>
            {chunkInfo && (
              <Text className="camera-upload-page__chunk-info">{chunkInfo}</Text>
            )}
          </View>
        )}

        {media && (
          <Button
            className="camera-upload-page__upload-btn"
            type="primary"
            block
            loading={uploading}
            onClick={handleUpload}
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        )}
      </View>
    </View>
  );
}

export default CameraUploadPage;
