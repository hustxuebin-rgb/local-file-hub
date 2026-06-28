import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, Input, List, Avatar, Button, Tag, Space, Typography, Modal, message } from 'antd';
import { UserOutlined, SearchOutlined } from '@ant-design/icons';
import { searchFriendUsers, sendFriendRequest } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { SearchUserItem } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

function AddFriendPage(): React.ReactNode {
  const [searchResults, setSearchResults] = useState<SearchUserItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUserItem | null>(null);
  const [messageText, setMessageText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleSearch = useCallback((value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchFriendUsers(trimmed);
        if (res.data) {
          setSearchResults(res.data.list);
        }
        setHasSearched(true);
      } catch (err: unknown) {
        const typedErr = err as { response?: { data?: { code?: number } } };
        message.error(getErrorMessage(typedErr.response?.data?.code));
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleOpenModal = useCallback((user: SearchUserItem) => {
    setSelectedUser(user);
    setMessageText('');
    setModalOpen(true);
  }, []);

  const handleSendRequest = useCallback(async () => {
    if (!selectedUser) return;
    setSending(true);
    try {
      await sendFriendRequest(selectedUser.id, messageText);
      message.success('好友申请已发送');
      setModalOpen(false);
      // 更新搜索结果中的状态
      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === selectedUser.id ? { ...item, hasPendingRequest: true } : item,
        ),
      );
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSending(false);
    }
  }, [selectedUser, messageText]);

  const renderAction = (item: SearchUserItem): React.ReactNode => {
    if (item.isFriend) {
      return <Tag color="green">已是好友</Tag>;
    }
    if (item.hasPendingRequest) {
      return <Tag color="orange">等待验证</Tag>;
    }
    return (
      <Button
        type="primary"
        size="small"
        onClick={() => handleOpenModal(item)}
        loading={sending}
      >
        添加好友
      </Button>
    );
  };

  return (
    <Card title="添加好友">
      <Input.Search
        placeholder="搜索用户名或昵称"
        enterButton={<><SearchOutlined /> 搜索</>}
        onSearch={handleSearch}
        onChange={(e) => {
          if (!e.target.value) {
            setSearchResults([]);
            setHasSearched(false);
            setSearching(false);
          }
        }}
        style={{ marginBottom: 24 }}
      />
      {hasSearched && searchResults.length === 0 && !searching ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
          未搜索到相关用户
        </div>
      ) : (
        <List<SearchUserItem>
          dataSource={searchResults}
          loading={searching}
          renderItem={(item) => (
            <List.Item actions={[renderAction(item)]}>
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
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        title="发送好友申请"
        open={modalOpen}
        onOk={handleSendRequest}
        onCancel={() => setModalOpen(false)}
        confirmLoading={sending}
        okText="发送申请"
        cancelText="取消"
      >
        <p>
          向 <Text strong>{selectedUser?.nickname}</Text>（@{selectedUser?.username}）发送好友申请？
        </p>
        <TextArea
          placeholder="附言（选填，最多200字）"
          maxLength={200}
          rows={3}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          style={{ marginTop: 12 }}
        />
      </Modal>
    </Card>
  );
}

export default AddFriendPage;
