import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Empty, Form, Input, InputNumber, Select, Button, Space, Popconfirm, message, Tag, Spin } from 'antd';
import { SyncOutlined, ReloadOutlined } from '@ant-design/icons';
import { getDiskInfo, getSyncTask, updateSyncTask, manualSync } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { DiskInfo, SyncTask } from '@/types';

function DiskManagePage(): React.ReactNode {
  const [diskList, setDiskList] = useState<DiskInfo[]>([]);
  const [syncTask, setSyncTask] = useState<SyncTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [diskRes, syncRes] = await Promise.all([getDiskInfo(), getSyncTask()]);
      if (diskRes.data) setDiskList(diskRes.data);
      if (syncRes.data) {
        setSyncTask(syncRes.data);
        form.setFieldsValue(syncRes.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateSync = async () => {
    try {
      const values = await form.validateFields();
      setSyncSubmitting(true);
      await updateSyncTask(values);
      message.success('同步配置已更新');
      setEditMode(false);
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSyncSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      await manualSync();
      message.success('手动同步已触发');
      fetchData();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setManualSyncing(false);
    }
  };

  const formatSize = (size: number): string => {
    const gb = size / 1024 / 1024 / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const diskTypeMap: Record<number, string> = { 0: '本地', 1: 'NAS', 2: '云存储' };
  const diskStatusMap: Record<number, { color: string; text: string }> = {
    0: { color: 'success', text: '正常' },
    1: { color: 'warning', text: '异常' },
    2: { color: 'error', text: '离线' },
  };
  const syncModeMap: Record<number, string> = { 0: '定时同步', 1: '实时同步' };
  const syncResultMap: Record<number, { color: string; text: string }> = {
    0: { color: 'success', text: '成功' },
    1: { color: 'error', text: '失败' },
  };

  if (loading) {
    return (
      <Card title="磁盘管理">
        <Spin />
      </Card>
    );
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      {/* 磁盘信息 */}
      {diskList.length > 0 ? (
        diskList.map((disk) => (
          <Card key={disk.id} title={`磁盘 #${disk.id}`} style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="磁盘类型">{diskTypeMap[disk.diskType] ?? '未知'}</Descriptions.Item>
              <Descriptions.Item label="磁盘路径">{disk.diskPath}</Descriptions.Item>
              <Descriptions.Item label="总容量">{formatSize(disk.totalSize)}</Descriptions.Item>
              <Descriptions.Item label="已使用">{formatSize(disk.usedSize)}</Descriptions.Item>
              <Descriptions.Item label="可用空间">{formatSize(disk.availableSize)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={diskStatusMap[disk.status]?.color}>
                  {diskStatusMap[disk.status]?.text ?? '未知'}
                </Tag>
              </Descriptions.Item>
              {disk.remark && (
                <Descriptions.Item label="备注">{disk.remark}</Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        ))
      ) : (
        <Card title="磁盘信息">
          <Empty description="暂无磁盘，请先配置存储盘" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {/* 同步配置 */}
      <Card
        title="同步配置"
        extra={
          <Space>
            <Popconfirm title="确认手动触发同步？" onConfirm={handleManualSync}>
              <Button icon={<SyncOutlined />} loading={manualSyncing} disabled={manualSyncing}>
                手动同步
              </Button>
            </Popconfirm>
            <Button onClick={() => setEditMode(!editMode)}>
              {editMode ? '取消' : '编辑'}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </Button>
          </Space>
        }
      >
        {syncTask && (
          <>
            {!editMode ? (
              <Descriptions column={2}>
                <Descriptions.Item label="同步模式">{syncModeMap[syncTask.syncMode] ?? '未知'}</Descriptions.Item>
                <Descriptions.Item label="Cron 表达式">{syncTask.cronExpr}</Descriptions.Item>
                <Descriptions.Item label="忽略后缀">{syncTask.ignoreSuffix ?? '无'}</Descriptions.Item>
                <Descriptions.Item label="速度限制">{syncTask.speedLimit ? `${syncTask.speedLimit} MB/s` : '不限'}</Descriptions.Item>
                <Descriptions.Item label="上次同步时间">{syncTask.lastSyncTime ?? '未同步'}</Descriptions.Item>
                <Descriptions.Item label="上次同步结果">
                  {syncTask.lastSyncResult !== undefined ? (
                    <Tag color={syncResultMap[syncTask.lastSyncResult]?.color}>
                      {syncResultMap[syncTask.lastSyncResult]?.text ?? '未知'}
                    </Tag>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="运行状态">
                  {syncTask.isRunning ? <Tag color="processing">运行中</Tag> : <Tag>未运行</Tag>}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Form form={form} layout="vertical">
                <Form.Item name="syncMode" label="同步模式" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 0, label: '定时同步' },
                      { value: 1, label: '实时同步' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="cronExpr" label="Cron 表达式" rules={[{ required: true, message: '请输入 Cron 表达式' }]}>
                  <Input placeholder="如 0 0 2 * * ?" />
                </Form.Item>
                <Form.Item name="ignoreSuffix" label="忽略后缀">
                  <Input placeholder="多个用逗号分隔，如 .tmp,.log" />
                </Form.Item>
                <Form.Item name="speedLimit" label="速度限制 (MB/s)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="0 表示不限速" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" onClick={handleUpdateSync} loading={syncSubmitting} disabled={syncSubmitting}>
                    保存配置
                  </Button>
                </Form.Item>
              </Form>
            )}
          </>
        )}
      </Card>
    </Space>
  );
}

export default DiskManagePage;
