import { View, Text } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, Tag } from '@nutui/nutui-react-taro';
import { getReceivedShares } from '../../utils/api';
import type { ShareRecord } from '../../utils/api';
import './index.scss';

interface ReceivedSharesProps {}

const PERM_MAP: Record<number, string> = {
  1: '只读',
  2: '可上传',
};

const PERM_COLOR: Record<number, string> = {
  1: '#999999',
  2: '#1677ff',
};

function ReceivedSharesPage(_props: ReceivedSharesProps): JSX.Element {
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useDidShow(() => {
    loadData();
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReceivedShares();
      setShares(res?.list || []);
    } catch {
      // 已在 request 中处理
    } finally {
      setLoading(false);
    }
  }, []);

  const handleShareClick = useCallback((share: ShareRecord) => {
    Taro.navigateTo({ url: `/pages/share-content/index?shareId=${share.id}` });
  }, []);

  return (
    <View className="received-shares-page">
      <View className="received-shares-page__header">
        <Text className="received-shares-page__title">收到的分享</Text>
      </View>

      {loading ? (
        <View className="received-shares-page__loading">
          <Loading>加载中...</Loading>
        </View>
      ) : (
        <View className="received-shares-page__content">
          {shares.length === 0 ? (
            <Empty description="暂无收到的分享" />
          ) : (
            shares.map((share) => (
              <View
                key={share.id}
                className="received-shares-page__share-item"
                onClick={() => handleShareClick(share)}
              >
                <View className="received-shares-page__share-info">
                  <Text className="received-shares-page__share-user">
                    {share.shareUserName}
                  </Text>
                  <Text className="received-shares-page__share-time">
                    {share.createTime?.slice(0, 10)}
                  </Text>
                </View>
                <Tag type="primary" plain>
                  {PERM_MAP[share.sharePerm] || '未知'}
                </Tag>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default ReceivedSharesPage;
