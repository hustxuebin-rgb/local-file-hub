import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  Select,
  InputNumber,
  Popconfirm,
  Tag,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { getUsers, addUser, updateUser, deleteUser, getDiskSimple } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { User, DiskSimple } from '@/types';

function UserManagePage(): React.ReactNode {
  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [diskOptions, setDiskOptions] = useState<DiskSimple[]>([]);

  const fetchData = async (p = page, kw = keyword) => {
    setLoading(true);
    try {
      const res = await getUsers({ page: p, pageSize, keyword: kw || undefined });
      if (res.data) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, '');
    fetchDiskList();
  }, []);

  const fetchDiskList = async () => {
    try {
      const res = await getDiskSimple();
      if (res.data) {
        setDiskOptions(res.data);
      }
    } catch {
      // 静默失败，磁盘选择为可选功能
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchData(1, keyword);
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({
      ...user,
      storageQuota: user.storageQuota ? Math.round(user.storageQuota / 1024 / 1024) : 0,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingUser) {
        const { username, password, ...updateFields } = values;
        await updateUser(editingUser.id, updateFields);
        message.success('更新成功');
      } else {
        await addUser(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchData(page);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id);
      message.success('删除成功');
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 0 ? 1 : 0;
    try {
      await updateUser(user.id, { status: newStatus });
      message.success(newStatus === 0 ? '已禁用' : '已启用');
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const formatQuota = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const columns: TableProps<User>['columns'] = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: number) => (role === 1 ? <Tag color="red">管理员</Tag> : <Tag>普通用户</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: number) => (s === 0 ? <Tag color="error">禁用</Tag> : <Tag color="success">启用</Tag>),
    },
    { title: '存储配额', dataIndex: 'storageQuota', key: 'storageQuota', render: (q: number) => formatQuota(q) },
    { title: '注册时间', dataIndex: 'createTime', key: 'createTime' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: User) => (
        <Space>
          <Button type="link" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={`确认${record.status === 0 ? '启用' : '禁用'}此用户？`}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Button type="link">{record.status === 0 ? '启用' : '禁用'}</Button>
          </Popconfirm>
          <Popconfirm title="确认删除此用户？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="用户管理"
      extra={
        <Space>
          <Input
            placeholder="搜索用户名/昵称"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
          />
          <Button onClick={handleSearch}>搜索</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增用户
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(1, '')}>
            刷新
          </Button>
        </Space>
      }
    >
      <Table<User>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => {
            setPage(p);
            fetchData(p);
          },
        }}
      />

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 0, label: '普通用户' },
                { value: 1, label: '管理员' },
              ]}
            />
          </Form.Item>
          <Form.Item name="storageQuota" label="存储配额 (MB)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="diskId" label="存储磁盘">
            <Select
              allowClear
              placeholder="自动选择（使用默认磁盘）"
              options={diskOptions}
              fieldNames={{ label: 'diskPath', value: 'id' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default UserManagePage;
