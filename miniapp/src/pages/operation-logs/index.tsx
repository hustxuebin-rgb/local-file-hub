import { View, Text, ScrollView } from '@tarojs/components';
import { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Empty, Loading, Cell } from '@nutui/nutui-react-taro';
import { getMyLogs } from '../../utils/api';
import type { OperationLogItem } from '../../utils/api';
import './index.scss';

const OPER_TYPE_LABELS: Record<number, string> = {
  1: '登录',
  2: '登出',
  3: '下载',
  4: '删除',
  5: '分享',
  6: '上传',
  7: '收藏',
  8: '移动',
  9: '重命名',
};

const OPER_TYPE_EMOJIS: Record<number, string> = {
  1: '🔑',
  2: '🚪',
  3: '⬇️',
  4: '🗑️',
  5: '🔗',
  6: '⬆️',
  7: '⭐',
  8: '📦',
  9: '✏️',
};

const TABS = [
  { label: '全部', operType: undefined },
  { label: '上传', operType: 6 },
  { label: '下载', operType: 3 },
];

interface OperationLogsProps {}

function OperationLogsPage(_props: OperationLogsProps): JSX.Element {
  const [items, setItems] = useState<OperationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useDidShow(() => {
    setPage(1);
    setHasMore(true);
    loadData(1, activeTab);
  });

  usePullDownRefresh(async () => {
    setPage(1);
    setHasMore(true);
    await loadData(1, activeTab);
    Taro.stopPullDownRefresh();
  });

  useReachBottom(() => {
    if (!hasMore || loadingMore || loading) return;
    loadMore();
  });

  const loadData = useCallback(async (pageNum: number, operType?: number) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await getMyLogs({
        operType,
        page: pageNum,
        pageSize: 20,
      });
      if (pageNum === 1) {
        setItems(res?.list || []);
      } else {
        setItems((prev) => [...prev, ...(res?.list || [])]);
      }
      setHasMore((res?.list || []).length >= 20);
      setPage(pageNum);
    } catch {
      // handled in request
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    loadData(page + 1, activeTab);
  }, [page, activeTab, loadData]);

  const handleTabChange = useCallback((operType: number | undefined) => {
    setActiveTab(operType);
    setPage(1);
    setHasMore(true);
    setItems([]);
    loadData(1, operType);
  }, [loadData]);

  const getOperTypeLabel = (operType: number): string => {
    return OPER_TYPE_LABELS[operType] || `操作(${operType})`;
  };

  const getOperTypeEmoji = (operType: number): string => {
    return OPER_TYPE_EMOJIS[operType] || '📋';
  };

  return (
    <View className="operation-logs-page">
      {/* Tabs */}
      <View className="operation-logs-page__tabs">
        {TABS.map((tab) => (
          <View
            key={tab.label}
            className={`operation-logs-page__tab ${activeTab === tab.operType ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.operType)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* 内容区 */}
      <ScrollView
        className="operation-logs-page__scroll"
        scrollY
        onScrollToLower={() => { if (hasMore && !loadingMore && !loading) loadMore(); }}
      >
        {loading ? (
          <View className="operation-logs-page__loading">
            <Loading>加载中...</Loading>
          </View>
        ) : (
          <View className="operation-logs-page__content">
            {items.length === 0 ? (
              <Empty description="暂无操作记录" />
            ) : (
              <View className="operation-logs-page__list">
                {items.map((item, index) => (
                  <Cell
                    key={item.id || index}
                    className="operation-logs-page__cell"
                    title={
                      <View className="operation-logs-page__cell-title">
                        <Text className="operation-logs-page__cell-emoji">
                          {getOperTypeEmoji(item.operType)}
                        </Text>
                        <View className="operation-logs-page__cell-text">
                          <Text className="operation-logs-page__cell-desc">{item.operDesc}</Text>
                          <Text className="operation-logs-page__cell-type">
                            {getOperTypeLabel(item.operType)}
                          </Text>
                        </View>
                      </View>
                    }
                    description={
                      <View className="operation-logs-page__cell-meta-row">
                        {item.localIp && (
                          <Text className="operation-logs-page__cell-ip">IP: {item.localIp}</Text>
                        )}
                        <Text className="operation-logs-page__cell-time">
                          {item.createTime?.replace('T', ' ').slice(0, 19)}
                        </Text>
                      </View>
                    }
                  />
                ))}
              </View>
            )}

            {loadingMore && (
              <View className="operation-logs-page__loading-more"><Loading>加载更多...</Loading></View>
            )}
            {!hasMore && items.length > 0 && (
              <View className="operation-logs-page__no-more"><Text>— 没有更多了 —</Text></View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default OperationLogsPage;
