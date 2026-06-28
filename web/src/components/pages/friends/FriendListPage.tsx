import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Avatar, Button, Space, Typography, Empty, Popconfirm, message } from 'antd';
import { UserOutlined, UserAddOutlined } from '@ant-design/icons';
import { useFriendStore } from '@/stores/useFriendStore';
import { deleteFriend as deleteFriendApi } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FriendInfo } from '@/types';

const { Text } = Typography;

function FriendListPage(): React.ReactNode {
  const navigate = useNavigate();
  const { friends, loading, fetchFriends } = useFriendStore();

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleDeleteFriend = useCallback(async (friendId: number) => {
    try {
      await deleteFriendApi(friendId);
      message.success('已删除好友');
      fetchFriends();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  }, [fetchFriends]);

  const formatTime = (timeStr: string): string => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <Card title="好友列表">
      {friends.length === 0 && !loading ? (
        <Empty
          description="暂无好友，去添加好友吧"
        >
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => navigate('/friends/add')}
          >
            去添加
          </Button>
        </Empty>
      ) : (
        <List<FriendInfo>
          dataSource={friends}
          loading={loading}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="delete"
                  title="确定删除该好友？"
                  onConfirm={() => handleDeleteFriend(item.friendId)}
                >
                  <Button type="link" danger size="small">
                    删除好友
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    src={item.avatarUrl}
                    icon={!item.avatarUrl ? <UserOutlined /> : undefined}
                  />
                }
                title={
                  <Space>
                    <Text strong>{item.nickname}</Text>
                    <Text type="secondary">@{item.username}</Text>
                  </Space>
                }
                description={`成为好友时间：${formatTime(item.createTime)}`}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

export default FriendListPage;
