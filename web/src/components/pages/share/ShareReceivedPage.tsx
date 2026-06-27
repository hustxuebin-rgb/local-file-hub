import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Space, message, Modal } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { getReceivedShares, getShareContents } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { ShareRecord } from '@/types';

const shareTypeMap: Record<number, string> = { 1: '文件', 2: '文件夹' };
const sharePermMap: Record<number, string> = { 1: '只读', 2: '可上传' };
const expireTypeMap: Record<number, string> = { 1: '1天', 2: '7天', 3: '30天', 4: '永久' };
const statusMap: Record<number, { color: string; text: string }> = {
  0: { color: 'processing', text: '有效' },
  1: { color: 'default', text: '已取消' },
  2: { color: 'error', text: '已过期' },
};

function ShareReceivedPage(): React.ReactNode {
  const [data, setData] = useState<ShareRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentData, setContentData] = useState<Record<string, unknown> | null>(null);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res = await getReceivedShares({ page: p, pageSize });
      if (res.data) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewContent = async (id: number) => {
    setContentLoading(true);
    setContentModalOpen(true);
    try {
      const res = await getShareContents(id);
      setContentData(res.data ? (res.data as Record<string, unknown>) : null);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
      setContentData(null);
    } finally {
      setContentLoading(false);
    }
  };

  const columns: TableProps<ShareRecord>['columns'] = [
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
    { title: '分享时间', dataIndex: 'createTime', key: 'createTime' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: ShareRecord) => (
        <Space>
          {record.status === 0 && (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewContent(record.id)}
            >
              查看内容
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="收到的分享"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => fetchData(1)}>
          刷新
        </Button>
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
        title="分享内容"
        open={contentModalOpen}
        onCancel={() => {
          setContentModalOpen(false);
          setContentData(null);
        }}
        footer={null}
        loading={contentLoading}
      >
        {contentData ? (
          <pre style={{ maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(contentData, null, 2)}
          </pre>
        ) : (
          !contentLoading && <div style={{ textAlign: 'center', padding: 24 }}>暂无内容</div>
        )}
      </Modal>
    </Card>
  );
}

export default ShareReceivedPage;
