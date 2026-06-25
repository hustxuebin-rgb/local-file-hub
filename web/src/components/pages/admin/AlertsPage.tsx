import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Tag, message } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined, CheckOutlined } from '@ant-design/icons';
import { getWarnLogs, readWarns } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { WarnLog } from '@/types';

function AlertsPage(): React.ReactNode {
  const [data, setData] = useState<WarnLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res = await getWarnLogs({ page: p, pageSize });
      if (res.data) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1);
  }, []);

  const handleBatchRead = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请至少选择一条告警');
      return;
    }
    try {
      await readWarns(selectedRowKeys);
      message.success('已标记为已读');
      setSelectedRowKeys([]);
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const warnTypeMap: Record<number, { color: string; text: string }> = {
    0: { color: 'warning', text: '磁盘告警' },
    1: { color: 'error', text: '同步告警' },
    2: { color: 'info', text: '安全告警' },
  };

  const columns: TableProps<WarnLog>['columns'] = [
    {
      title: '告警类型',
      dataIndex: 'warnType',
      key: 'warnType',
      render: (type: number) => {
        const info = warnTypeMap[type] ?? { color: 'default', text: '未知' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    { title: '告警内容', dataIndex: 'warnContent', key: 'warnContent' },
    {
      title: '状态',
      dataIndex: 'isRead',
      key: 'isRead',
      render: (isRead: number) =>
        isRead ? <Tag>已读</Tag> : <Tag color="processing">未读</Tag>,
    },
    { title: '时间', dataIndex: 'createTime', key: 'createTime' },
  ];

  return (
    <Card
      title="告警管理"
      extra={
        <Space>
          <Button
            icon={<CheckOutlined />}
            onClick={handleBatchRead}
            disabled={selectedRowKeys.length === 0}
          >
            标记已读
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(1)}>
            刷新
          </Button>
        </Space>
      }
    >
      <Table<WarnLog>
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
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys.map(Number)),
        }}
      />
    </Card>
  );
}

export default AlertsPage;
