import React, { useState } from 'react';
import { Card, Descriptions, Button, Modal, Form, Input, message, Avatar, Space } from 'antd';
import { UserOutlined, EditOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { updateUser } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';

function ProfilePage(): React.ReactNode {
  const { user, setUser } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const handleEdit = () => {
    if (!user) return;
    form.setFieldsValue({ nickname: user.nickname });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (user) {
        await updateUser(user.id, { nickname: values.nickname });
        setUser({ ...user, nickname: values.nickname });
      }
      message.success('个人资料已更新');
      setModalOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return <Card title="个人资料">请先登录</Card>;
  }

  return (
    <>
      <Card
        title="个人资料"
        extra={
          <Button icon={<EditOutlined />} onClick={handleEdit}>
            编辑
          </Button>
        }
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar size={64} icon={<UserOutlined />} />
            <div>
              <h3>{user.nickname}</h3>
              <span style={{ color: '#999' }}>@{user.username}</span>
            </div>
          </div>

          <Descriptions column={1}>
            <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
            <Descriptions.Item label="昵称">{user.nickname}</Descriptions.Item>
            <Descriptions.Item label="角色">
              {user.role === 1 ? '管理员' : '普通用户'}
            </Descriptions.Item>
            <Descriptions.Item label="存储根目录">{user.storageRoot}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{user.createTime}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {user.status === 1 ? '正常' : '禁用'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <Modal
        title="编辑个人资料"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default ProfilePage;
