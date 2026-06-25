import { View, Text } from '@tarojs/components';
import { useDidShow, getCurrentInstance } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import {
  Button,
  Cell,
  Input,
  Radio,
  RadioGroup,
  Toast,
} from '@nutui/nutui-react-taro';
import { createShare, searchUsers } from '../../utils/api';
import type { SearchUser } from '../../utils/api';
import './index.scss';

interface CreateShareProps {}

const EXPIRE_OPTIONS = [
  { value: 1, text: '1 天' },
  { value: 7, text: '7 天' },
  { value: 30, text: '30 天' },
  { value: -1, text: '永久' },
];

const PERM_OPTIONS = [
  { value: 1, text: '只读' },
  { value: 2, text: '可上传' },
];

function CreateSharePage(_props: CreateShareProps): JSX.Element {
  const [resourceId, setResourceId] = useState<number>(0);
  const [shareType, setShareType] = useState(1);
  const [receiveUserId, setReceiveUserId] = useState<number>(0);
  const [sharePerm, setSharePerm] = useState(1);
  const [expireType, setExpireType] = useState(7);
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params = getCurrentInstance().router?.params as {
    resourceId?: string;
    shareType?: string;
  };

  useDidShow(() => {
    if (params?.resourceId) {
      setResourceId(Number(params.resourceId));
    }
    if (params?.shareType) {
      setShareType(Number(params.shareType));
    }
  });

  const handleSearchUser = useCallback(async () => {
    if (!keyword.trim()) return;
    try {
      const res = await searchUsers(keyword.trim());
      setUsers(res || []);
    } catch {
      // 已在 request 中处理
    }
  }, [keyword]);

  const handleCreate = useCallback(async () => {
    if (!receiveUserId) {
      Taro.showToast({ title: '请选择分享用户', icon: 'none' });
      return;
    }
    if (!resourceId) {
      Taro.showToast({ title: '分享资源不存在', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      await createShare({
        resourceId,
        shareType,
        receiveUserId,
        sharePerm,
        expireType,
      });
      Taro.showToast({ title: '分享创建成功', icon: 'success' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 500);
    } catch {
      // 已在 request 中处理
    } finally {
      setSubmitting(false);
    }
  }, [resourceId, shareType, receiveUserId, sharePerm, expireType]);

  return (
    <View className="create-share-page">
      <View className="create-share-page__header">
        <Text className="create-share-page__title">创建分享</Text>
      </View>

      <View className="create-share-page__content">
        {/* 选择用户 */}
        <Cell>
          <Text className="create-share-page__label">分享给</Text>
        </Cell>
        <Cell>
          <View className="create-share-page__search">
            <Input
              className="create-share-page__search-input"
              placeholder="搜索用户名"
              value={keyword}
              onChange={(v) => setKeyword(v)}
            />
            <Button size="small" onClick={handleSearchUser}>
              搜索
            </Button>
          </View>
        </Cell>

        {users.length > 0 && (
          <Cell>
            <View className="create-share-page__user-list">
              {users.map((user) => (
                <View
                  key={user.id}
                  className={`create-share-page__user-item ${
                    selectedUser?.id === user.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    setSelectedUser(user);
                    setReceiveUserId(user.id);
                  }}
                >
                  <Text>{user.nickname || user.username}</Text>
                </View>
              ))}
            </View>
          </Cell>
        )}

        {selectedUser && (
          <Cell>
            <Text className="create-share-page__selected">
              已选择: {selectedUser.nickname || selectedUser.username}
            </Text>
          </Cell>
        )}

        {/* 选择权限 */}
        <Cell>
          <Text className="create-share-page__label">权限</Text>
        </Cell>
        <Cell>
          <RadioGroup
            value={sharePerm}
            onChange={(v) => setSharePerm(v as number)}
          >
            {PERM_OPTIONS.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.text}
              </Radio>
            ))}
          </RadioGroup>
        </Cell>

        {/* 选择有效期 */}
        <Cell>
          <Text className="create-share-page__label">有效期</Text>
        </Cell>
        <Cell>
          <RadioGroup
            value={expireType}
            onChange={(v) => setExpireType(v as number)}
          >
            {EXPIRE_OPTIONS.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.text}
              </Radio>
            ))}
          </RadioGroup>
        </Cell>

        {/* 提交按钮 */}
        <Button
          className="create-share-page__submit"
          type="primary"
          block
          size="large"
          loading={submitting}
          onClick={handleCreate}
        >
          创建分享
        </Button>
      </View>
    </View>
  );
}

export default CreateSharePage;
