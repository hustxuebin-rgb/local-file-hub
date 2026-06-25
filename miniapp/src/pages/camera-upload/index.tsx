import { View, Text, Image } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Button } from '@nutui/nutui-react-taro';
import './index.scss';

interface CameraUploadProps {}

function CameraUploadPage(_props: CameraUploadProps): JSX.Element {
  const [media, setMedia] = useState<{ path: string; size: number; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);

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
    try {
      await Taro.uploadFile({
        url: 'http://localhost:8080/api/miniapp/camera_upload',
        filePath: media.path,
        name: 'file',
        header: {
          Authorization: `Bearer ${Taro.getStorageSync('token')}`,
        },
      });
      Taro.showToast({ title: '上传成功', icon: 'success' });
      setMedia(null);
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
