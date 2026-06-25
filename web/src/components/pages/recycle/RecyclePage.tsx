import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Popconfirm, Tag, message } from 'antd';
import type { TableProps } from 'antd';
import { ReloadOutlined, RollbackOutlined, DeleteOutlined } from '@ant-design/icons';
import { recycleList, recycleRecover, recycleDelete } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FileInfo } from '@/types';

function RecyclePage(): React.ReactNode {
  const [data, setData] = useState<FileInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res = await recycleList({ page: p, pageSize });
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

  const handleRecover = async (id: number) => {
    try {
      await recycleRecover(id);
      message.success('恢复成功');
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await recycleDelete(id);
      message.success('已彻底删除');
      fetchData(page);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const columns: TableProps<FileInfo>['columns'] = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    { title: '大小', dataIndex: 'fileSize', key: 'fileSize', render: (s: number) => formatFileSize(s) },
    { title: '删除时间', dataIndex: 'deleteTime', key: 'deleteTime' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: FileInfo) => (
        <Space>
          <Popconfirm title="确认恢复此文件？" onConfirm={() => handleRecover(record.id)}>
            <Button type="link" icon={<RollbackOutlined />}>
              恢复
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认彻底删除？"
            description="此操作不可恢复"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              彻底删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="回收站"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => fetchData(1)}>
          刷新
        </Button>
      }
    >
      <Table<FileInfo>
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

export default RecyclePage;
