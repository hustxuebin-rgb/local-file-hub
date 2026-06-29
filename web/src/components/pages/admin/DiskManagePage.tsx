import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Empty, Form, Input, InputNumber, Select, Button, Space, Popconfirm, Modal, message, Tag, Spin } from 'antd';
import { SyncOutlined, ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getDiskInfo, getSyncTask, updateSyncTask, manualSync, createDisk, updateDisk, deleteDisk, scanMounts } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { DiskInfo, SyncTask, MountInfo } from '@/types';
import FolderPicker from '@/components/shared/FolderPicker';

function DiskManagePage(): React.ReactNode {
  const [diskList, setDiskList] = useState<DiskInfo[]>([]);
  const [syncTask, setSyncTask] = useState<SyncTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();
  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const [editingDisk, setEditingDisk] = useState<DiskInfo | null>(null);
  const [diskForm] = Form.useForm();
  const [diskSubmitting, setDiskSubmitting] = useState(false);
  const [diskStep, setDiskStep] = useState<1 | 2 | 3>(1);
  const [mountList, setMountList] = useState<MountInfo[]>([]);
  const [mountLoading, setMountLoading] = useState(false);
  const [selectedMount, setSelectedMount] = useState<string>('');

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleDiskAdd = () => {
    setEditingDisk(null);
    diskForm.resetFields();
    setDiskStep(1);
    setSelectedMount('');
    setMountList([]);
    setDiskModalOpen(true);
  };

  const handleDiskEdit = async (disk: DiskInfo) => {
    setEditingDisk(disk);
    diskForm.setFieldsValue(disk);
    setSelectedMount(disk.diskPath);
    setDiskStep(3);
    setDiskModalOpen(true);
    // 预加载挂载点列表，以便用户在步骤 3 点击「上一步」回到步骤 2 时有可选挂载点
    setMountLoading(true);
    try {
      const res = await scanMounts();
      if (res.data) setMountList(res.data);
    } catch {
      // 忽略加载失败，步骤 2 会处理空状态
    } finally {
      setMountLoading(false);
    }
  };

  const handleDiskDelete = async (id: number) => {
    try {
      await deleteDisk(id);
      message.success('磁盘已删除');
      fetchData();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  const handleDiskSubmit = async () => {
    try {
      const values = await diskForm.validateFields();
      // 防护：如果 diskType 因 preserve=false 丢失，引导用户回到步骤 1
      if (!editingDisk && values.diskType === undefined) {
        message.warning('请选择磁盘类型');
        setDiskStep(1);
        return;
      }
      setDiskSubmitting(true);
      if (editingDisk) {
        await updateDisk(editingDisk.id, values);
        message.success('磁盘已更新');
      } else {
        await createDisk(values);
        message.success('磁盘已添加');
      }
      setDiskModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setDiskSubmitting(false);
    }
  };

  const formatSize = (size: number): string => {
    const gb = size / 1024 / 1024 / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const diskTypeMap: Record<number, string> = { 0: '本地', 1: 'NAS', 2: '云存储' };
  const diskStatusMap: Record<number, { color: string; text: string }> = {
    0: { color: 'error', text: '离线' },
    1: { color: 'success', text: '正常' },
    2: { color: 'warning', text: '异常' },
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
      <Card
        title="磁盘信息"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleDiskAdd}>
            添加磁盘
          </Button>
        }
      >
        {diskList.length > 0 ? (
          diskList.map((disk) => (
            <Card
              key={disk.id}
              title={`磁盘 #${disk.id}`}
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleDiskEdit(disk)}>
                    编辑
                  </Button>
                  <Popconfirm title="确认删除此磁盘？删除后相关文件记录将失效" onConfirm={() => handleDiskDelete(disk.id)}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
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
        <Empty description="暂无磁盘，请先配置存储盘" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      </Card>

      {/* 磁盘编辑 Modal */}
      <Modal
        title={editingDisk ? '编辑磁盘' : '添加磁盘'}
        open={diskModalOpen}
        onOk={diskStep === 3 ? handleDiskSubmit : undefined}
        onCancel={() => {
          setDiskModalOpen(false);
          diskForm.resetFields();
          setDiskStep(1);
          setSelectedMount('');
          setMountList([]);
        }}
        confirmLoading={diskSubmitting}
        footer={diskStep === 3 ? undefined : null}
      >
        <Form form={diskForm} layout="vertical">
          {/* 步骤 1：选择磁盘类型 */}
          {diskStep === 1 && (
            <>
              <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
                步骤 1/3：选择磁盘类型
              </div>
              <Form.Item name="diskType" label="磁盘类型" preserve={true} rules={[{ required: true, message: '请选择磁盘类型' }]}>
                <Select
                  placeholder="请选择磁盘类型"
                  options={[
                    { value: 0, label: '本地' },
                    { value: 1, label: 'NAS' },
                    { value: 2, label: '云存储' },
                  ]}
                />
              </Form.Item>
              <Button
                type="primary"
                loading={mountLoading}
                onClick={async () => {
                  try {
                    await diskForm.validateFields(['diskType']);
                  } catch { return; }
                  setMountLoading(true);
                  try {
                    const res = await scanMounts();
                    if (res.data) setMountList(res.data);
                  } catch (err: unknown) {
                    const typedErr = err as { response?: { data?: { code?: number } } };
                    message.error(getErrorMessage(typedErr.response?.data?.code));
                    return;
                  } finally {
                    setMountLoading(false);
                  }
                  setDiskStep(2);
                }}
              >
                下一步
              </Button>
            </>
          )}

          {/* 步骤 2：选择磁盘（挂载点） */}
          {diskStep === 2 && (
            <>
              <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
                步骤 2/3：选择磁盘
              </div>
              {mountLoading ? (
                <Spin />
              ) : (
                <Select
                  style={{ width: '100%' }}
                  placeholder="请选择磁盘"
                  value={selectedMount || undefined}
                  onChange={(value) => setSelectedMount(value)}
                  options={mountList.map((m) => ({
                    value: m.mountPoint,
                    label: (
                      <div>
                        <div style={{ fontWeight: 500 }}>{m.mountPoint}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>
                          {m.fsType} · {m.device}
                        </div>
                      </div>
                    ),
                  }))}
                  notFoundContent={mountList.length === 0 ? '未发现可用磁盘，请检查磁盘连接' : undefined}
                />
              )}
              <div style={{ marginTop: 16 }}>
                <Button onClick={() => setDiskStep(1)} style={{ marginRight: 8 }}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  disabled={!selectedMount}
                  onClick={() => {
                    if (!selectedMount) { message.warning('请选择磁盘'); return; }
                    diskForm.setFieldsValue({ diskPath: selectedMount });
                    setDiskStep(3);
                  }}
                >
                  下一步
                </Button>
              </div>
            </>
          )}

          {/* 步骤 3：选择存储路径 */}
          {diskStep === 3 && (
            <>
              <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
                步骤 3/3：选择存储路径
              </div>
              <Form.Item name="diskPath" label="磁盘路径" preserve={true} rules={[{ required: true, message: '请选择存储路径' }]}>
                <FolderPicker
                  placeholder="在选定磁盘中选择存储路径"
                  initialPath={selectedMount}
                />
              </Form.Item>
              {editingDisk && (
                <Form.Item name="status" label="磁盘状态">
                  <Select
                    options={[
                      { value: 0, label: '离线' },
                      { value: 1, label: '正常' },
                      { value: 2, label: '异常' },
                    ]}
                  />
                </Form.Item>
              )}
              <Form.Item name="remark" label="备注">
                <Input placeholder="可选备注" />
              </Form.Item>
              <div style={{ marginTop: 16 }}>
                <Button onClick={() => setDiskStep(2)}>上一步</Button>
              </div>
            </>
          )}
        </Form>
      </Modal>
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
