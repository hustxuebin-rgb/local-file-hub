import { useState, useEffect, useCallback } from 'react';
import { Card, Tabs, List, Avatar, Button, Tag, Space, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { getReceivedRequests, getSentRequests, acceptRequest, rejectRequest } from '@/api';
import { useFriendStore } from '@/stores/useFriendStore';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FriendRequestInfo } from '@/types';

const { Text } = Typography;

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待处理', color: 'blue' },
  1: { label: '已同意', color: 'green' },
  2: { label: '已拒绝', color: 'red' },
};

function FriendRequestsPage(): React.ReactNode {
  const [activeTab, setActiveTab] = useState<string>('received');
  const [receivedList, setReceivedList] = useState<FriendRequestInfo[]>([]);
  const [sentList, setSentList] = useState<FriendRequestInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const { fetchPendingCount, fetchFriends } = useFriendStore();

  const loadReceived = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReceivedRequests();
      if (res.data) {
        setReceivedList(res.data.list);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSentRequests();
      if (res.data) {
        setSentList(res.data.list);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'received') {
      loadReceived();
    } else {
      loadSent();
    }
  }, [activeTab, loadReceived, loadSent]);

  const handleAccept = useCallback(async (id: number) => {
    setProcessing(true);
    try {
      await acceptRequest(id);
      message.success('已同意好友申请');
      loadReceived();
      fetchFriends();
      fetchPendingCount();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setProcessing(false);
    }
  }, [loadReceived, fetchPendingCount, fetchFriends]);

  const handleReject = useCallback(async (id: number) => {
    setProcessing(true);
    try {
      await rejectRequest(id);
      message.success('已拒绝好友申请');
      loadReceived();
      fetchPendingCount();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setProcessing(false);
    }
  }, [loadReceived, fetchPendingCount]);

  const formatTime = (timeStr: string): string => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${min}`;
  };

  const renderReceivedItem = (item: FriendRequestInfo): React.ReactNode => {
    const statusInfo = STATUS_MAP[item.status] ?? { label: '未知', color: 'default' };
    const isPending = item.status === 0;

    return (
      <List.Item
        actions={
          isPending
            ? [
                <Button
                  key="accept"
                  type="primary"
                  size="small"
                  loading={processing}
                  onClick={() => handleAccept(item.id)}
                >
                  同意
                </Button>,
                <Button
                  key="reject"
                  danger
                  size="small"
                  loading={processing}
                  onClick={() => handleReject(item.id)}
                >
                  拒绝
                </Button>,
              ]
            : [
                <Tag key="status" color={statusInfo.color}>
                  {statusInfo.label}
                </Tag>,
              ]
        }
      >
        <List.Item.Meta
          avatar={
            <Avatar
              src={item.fromUserAvatar}
              icon={!item.fromUserAvatar ? <UserOutlined /> : undefined}
            />
          }
          title={item.fromUserName}
          description={
            <Space direction="vertical" size={0}>
              <Text type="secondary">{formatTime(item.createTime)}</Text>
              {item.message && (
                <Text type="secondary">附言：{item.message}</Text>
              )}
            </Space>
          }
        />
      </List.Item>
    );
  };

  const renderSentItem = (item: FriendRequestInfo): React.ReactNode => {
    const statusInfo = STATUS_MAP[item.status] ?? { label: '未知', color: 'default' };

    return (
      <List.Item
        actions={[
          <Tag key="status" color={statusInfo.color}>
            {statusInfo.label}
          </Tag>,
        ]}
      >
        <List.Item.Meta
          avatar={
            <Avatar icon={<UserOutlined />} />
          }
          title={item.toUserName || `用户${item.toUserId}`}
          description={
            <Space direction="vertical" size={0}>
              <Text type="secondary">{formatTime(item.createTime)}</Text>
              {item.message && (
                <Text type="secondary">附言：{item.message}</Text>
              )}
            </Space>
          }
        />
      </List.Item>
    );
  };

  const tabItems = [
    {
      key: 'received',
      label: '收到的申请',
      children: (
        <List<FriendRequestInfo>
          dataSource={receivedList}
          loading={loading}
          locale={{ emptyText: '暂无收到的好友申请' }}
          renderItem={renderReceivedItem}
        />
      ),
    },
    {
      key: 'sent',
      label: '发出的申请',
      children: (
        <List<FriendRequestInfo>
          dataSource={sentList}
          loading={loading}
          locale={{ emptyText: '暂无发出的好友申请' }}
          renderItem={renderSentItem}
        />
      ),
    },
  ];

  return (
    <Card title="好友申请">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        items={tabItems}
      />
    </Card>
  );
}

export default FriendRequestsPage;
