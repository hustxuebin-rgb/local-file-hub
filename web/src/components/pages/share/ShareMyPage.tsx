import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Tag,
  List,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import { ShareAltOutlined, DeleteOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { getMyShares, createShare, cancelShare, searchUsers, getShareViewers } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { ShareRecord, ShareViewer, User } from '@/types';

function ShareMyPage(): React.ReactNode {
  const [data, setData] = useState<ShareRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [userOptions, setUserOptions] = useState<{ value: number; label: string }[]>([]);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewers, setViewers] = useState<ShareViewer[]>([]);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res = await getMyShares({ page: p, pageSize });
      if (res.data) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchUser = async (keyword: string) => {
    if (!keyword) return;
    try {
      const res = await searchUsers(keyword);
      if (res.data) {
        setUserOptions(
          res.data.map((u: User) => ({ value: u.id, label: `${u.nickname} (${u.username})` })),
        );
      }
    } catch {
      // 搜索失败静默处理
    }
  };

  const handleCreateShare = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await createShare(values);
      message.success('分享创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchData(1);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // form validation
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelShare = async (id: number) => {
    try {
      await cancelShare(id);
      message.success('分享已取消');
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleViewViewers = async (shareId: number) => {
    setViewerModalOpen(true);
    setViewerLoading(true);
    setViewers([]);
    try {
      const res = await getShareViewers(shareId);
      if (res.data) {
        setViewers(res.data.list);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setViewerLoading(false);
    }
  };

  const shareTypeMap: Record<number, string> = { 1: '文件', 2: '文件夹' };
  const sharePermMap: Record<number, string> = { 1: '只读', 2: '可上传' };
  const expireTypeMap: Record<number, string> = { 1: '永久', 2: '1天', 3: '7天', 4: '30天' };
  const statusMap: Record<number, { color: string; text: string }> = {
    0: { color: 'default', text: '已取消' },
    1: { color: 'processing', text: '有效' },
    2: { color: 'error', text: '已过期' },
  };

  const columns: TableProps<ShareRecord>['columns'] = [
    { title: '分享内容', dataIndex: 'resourceName', key: 'resourceName', render: (n: string) => n || '-' },
    { title: '接收者', dataIndex: 'receiveUserName', key: 'receiveUserName', render: (n: string) => n || '-' },
    { title: '分享类型', dataIndex: 'shareType', key: 'shareType', render: (t: number) => shareTypeMap[t] ?? '未知' },
    { title: '权限', dataIndex: 'sharePerm', key: 'sharePerm', render: (p: number) => sharePermMap[p] ?? '未知' },
    { title: '有效期', dataIndex: 'expireType', key: 'expireType', render: (e: number) => expireTypeMap[e] ?? '未知' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: number) => {
        const info = statusMap[s] ?? { color: 'default', text: '未知' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime' },
    {
      title: '查看记录',
      key: 'viewers',
      render: (_: unknown, record: ShareRecord) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewViewers(record.id)}
        >
          查看
        </Button>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: ShareRecord) =>
        record.status === 1 ? (
          <Popconfirm
            title="确认取消此分享？"
            description="取消后其他用户将无法访问"
            onConfirm={() => handleCancelShare(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              取消分享
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Card
      title="我的分享"
      extra={
        <Space>
          <Button type="primary" icon={<ShareAltOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建分享
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(1)}>
            刷新
          </Button>
        </Space>
      }
    >
      <Table<ShareRecord>
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
        title="创建分享"
        open={createModalOpen}
        onOk={handleCreateShare}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="resourceId" label="资源 ID" rules={[{ required: true, message: '请输入资源 ID' }]}>
            <Input type="number" placeholder="文件或文件夹 ID" />
          </Form.Item>
          <Form.Item name="shareType" label="分享类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: '文件' },
                { value: 2, label: '文件夹' },
              ]}
            />
          </Form.Item>
          <Form.Item name="sharePerm" label="权限" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: '只读' },
                { value: 2, label: '可上传' },
              ]}
            />
          </Form.Item>
          <Form.Item name="receiveUserId" label="目标用户" rules={[{ required: true, message: '请选择目标用户' }]}>
            <Select
              showSearch
              placeholder="搜索并选择用户"
              filterOption={false}
              onSearch={handleSearchUser}
              options={userOptions}
            />
          </Form.Item>
          <Form.Item name="expireType" label="有效期" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 2, label: '1天' },
                { value: 3, label: '7天' },
                { value: 4, label: '30天' },
                { value: 1, label: '永久' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="查看记录"
        open={viewerModalOpen}
        onCancel={() => {
          setViewerModalOpen(false);
          setViewers([]);
        }}
        footer={null}
        loading={viewerLoading}
      >
        {viewers.length > 0 ? (
          <List
            dataSource={viewers}
            renderItem={(v: ShareViewer) => (
              <List.Item>
                <List.Item.Meta
                  title={v.userName}
                  description={v.viewTime}
                />
              </List.Item>
            )}
          />
        ) : (
          !viewerLoading && <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>暂无查看记录</div>
        )}
      </Modal>
    </Card>
  );
}

export default ShareMyPage;
