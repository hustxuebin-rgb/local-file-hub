import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, message } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getSyncLogs } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { OperationLog } from '@/types';

function SyncLogsPage(): React.ReactNode {
  const [data, setData] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res = await getSyncLogs({ page: p, pageSize });
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

  const columns: TableProps<OperationLog>['columns'] = [
    {
      title: '操作类型',
      dataIndex: 'operType',
      key: 'operType',
      render: (type: string) => <Tag>{type}</Tag>,
    },
    { title: '操作描述', dataIndex: 'operDesc', key: 'operDesc' },
    { title: '来源 IP', dataIndex: 'localIp', key: 'localIp' },
    { title: '操作时间', dataIndex: 'createTime', key: 'createTime' },
  ];

  return (
    <Card
      title="同步日志"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => fetchData(1)}>
          刷新
        </Button>
      }
    >
      <Table<OperationLog>
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
    </Card>
  );
}

export default SyncLogsPage;
