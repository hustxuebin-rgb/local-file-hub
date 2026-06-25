import { View, Text } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import { Loading, Empty, Progress } from '@nutui/nutui-react-taro';
import { getStorageStat } from '../../utils/api';
import type { StorageStat } from '../../utils/api';
import './index.scss';

interface StorageStatsProps {}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function StorageStatsPage(_props: StorageStatsProps): JSX.Element {
  const [stats, setStats] = useState<StorageStat | null>(null);
  const [loading, setLoading] = useState(true);

  useDidShow(() => {
    loadData();
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStorageStat();
      setStats(res);
    } catch {
      // 已在 request 中处理
    } finally {
      setLoading(false);
    }
  }, []);

  const usagePercent = stats
    ? Math.min(100, Math.round((stats.usedBytes / stats.totalQuota) * 100))
    : 0;

  return (
    <View className="storage-stats-page">
      <View className="storage-stats-page__header">
        <Text className="storage-stats-page__title">存储统计</Text>
      </View>

      {loading ? (
        <View className="storage-stats-page__loading">
          <Loading>加载中...</Loading>
        </View>
      ) : !stats ? (
        <Empty description="加载失败" />
      ) : (
        <View className="storage-stats-page__content">
          {/* 使用概况 */}
          <View className="storage-stats-page__card">
            <Text className="storage-stats-page__card-title">存储概况</Text>
            <View className="storage-stats-page__usage">
              <Progress percent={usagePercent} />
              <View className="storage-stats-page__usage-info">
                <Text className="storage-stats-page__usage-text">
                  已用 {formatBytes(stats.usedBytes)} / 总配额 {formatBytes(stats.totalQuota)}
                </Text>
                <Text className="storage-stats-page__usage-percent">
                  使用率 {usagePercent}%
                </Text>
              </View>
            </View>
          </View>

          {/* 文件类型分布 */}
          <View className="storage-stats-page__card">
            <Text className="storage-stats-page__card-title">文件类型分布</Text>
            {stats.fileTypeStats?.length > 0 ? (
              <View className="storage-stats-page__type-list">
                {stats.fileTypeStats.map((item, index) => (
                  <View key={index} className="storage-stats-page__type-item">
                    <View className="storage-stats-page__type-info">
                      <Text className="storage-stats-page__type-name">
                        {item.fileType || '未知'}
                      </Text>
                      <Text className="storage-stats-page__type-count">
                        {item.count} 个文件
                      </Text>
                    </View>
                    <Text className="storage-stats-page__type-size">
                      {formatBytes(item.totalBytes)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Empty description="暂无文件数据" />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default StorageStatsPage;
