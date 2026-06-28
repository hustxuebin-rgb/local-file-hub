import React, { useEffect, useState, useCallback } from 'react';
import {
  Breadcrumb,
  List,
  Button,
  Modal,
  Input,
  message,
  Spin,
  Popconfirm,
  Space,
  Empty,
} from 'antd';
import { FolderOutlined, FolderAddOutlined, DeleteOutlined, HomeOutlined } from '@ant-design/icons';
import { scanMounts, browseDirs, createDir, deleteDir } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { MountInfo, DirEntry } from '@/types';

interface FolderPickerProps {
  value?: string;
  onChange?: (path: string) => void;
  placeholder?: string;
  initialPath?: string;
}

interface BreadcrumbItem {
  name: string;
  path: string;
}

function FolderPicker({ value, onChange, placeholder = '选择存储路径', initialPath }: FolderPickerProps): React.ReactNode {
  const [currentPath, setCurrentPath] = useState<string>(value || '');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [mountPoints, setMountPoints] = useState<MountInfo[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // 初始化：如果有 initialPath，直接浏览该路径；否则获取挂载点列表
  useEffect(() => {
    if (initialPath) {
      // 跳过挂载点选择，直接进入目录浏览
      setSelectedPath(initialPath);
      browsePath(initialPath);
      setInitLoading(false);
      return;
    }
    // 原有逻辑：获取挂载点列表
    const fetchMounts = async () => {
      setInitLoading(true);
      try {
        const res = await scanMounts();
        if (res.data) {
          setMountPoints(res.data);
        }
      } catch (err: unknown) {
        const typedErr = err as { response?: { data?: { code?: number } } };
        message.error(getErrorMessage(typedErr.response?.data?.code));
      } finally {
        setInitLoading(false);
      }
    };
    fetchMounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 浏览目录
  const browsePath = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await browseDirs(path);
      if (res.data) {
        setEntries(res.data);
        setCurrentPath(path);
        // 构建面包屑
        const segments = path.split('/').filter(Boolean);
        const crumbs: BreadcrumbItem[] = [];
        let accumulated = '';
        for (const seg of segments) {
          accumulated += '/' + seg;
          crumbs.push({ name: seg, path: accumulated });
        }
        setBreadcrumbs(crumbs);
      }
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  // 同步外部 value 到内部 selectedPath，并加载对应目录
  useEffect(() => {
    if (value !== undefined && value !== selectedPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPath(value);
      setCurrentPath(value);
      if (value) {
        browsePath(value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, browsePath]);

  // 点击挂载点 → 浏览其子目录
  const handleMountClick = (mountPoint: string) => {
    setSelectedPath(mountPoint);
    onChange?.(mountPoint);
    browsePath(mountPoint);
  };

  // 点击目录条目
  const handleEntryClick = (entry: DirEntry) => {
    setSelectedPath(entry.path);
    onChange?.(entry.path);
    browsePath(entry.path);
  };

  // 面包屑点击跳回
  const handleBreadcrumbClick = (crumb: BreadcrumbItem) => {
    setSelectedPath(crumb.path);
    onChange?.(crumb.path);
    browsePath(crumb.path);
  };

  // 回到挂载点列表
  const handleGoToRoot = () => {
    setCurrentPath('');
    setEntries([]);
    setBreadcrumbs([]);
    setSelectedPath('');
    onChange?.('');
  };

  // 新建文件夹
  const handleCreateDir = async () => {
    if (!newDirName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    setCreateSubmitting(true);
    try {
      await createDir(currentPath, newDirName.trim());
      message.success('文件夹创建成功');
      setCreateModalOpen(false);
      setNewDirName('');
      browsePath(currentPath);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setCreateSubmitting(false);
    }
  };

  // 删除空文件夹
  const handleDeleteDir = async (path: string) => {
    try {
      await deleteDir(path);
      message.success('文件夹已删除');
      if (selectedPath === path) {
        setSelectedPath('');
        onChange?.('');
      }
      browsePath(currentPath);
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    }
  };

  // 挂载点列表模式（初始状态）：无 initialPath 且无 currentPath
  const isRootLevel = !initialPath && currentPath === '' && entries.length === 0;

  if (initLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin tip="加载挂载点..." />
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 6,
        padding: 12,
        minHeight: 200,
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      {/* 面包屑 + 当前选中路径提示 */}
      <div style={{ marginBottom: 8 }}>
        {isRootLevel ? (
          <div style={{ color: '#999', fontSize: 13 }}>{placeholder}</div>
        ) : (
          <>
            <Breadcrumb
              items={[
                {
                  title: (
                    <Button
                      type="link"
                      size="small"
                      icon={<HomeOutlined />}
                      onClick={handleGoToRoot}
                      style={{ padding: 0 }}
                    >
                      挂载点
                    </Button>
                  ),
                },
                ...breadcrumbs.map((crumb) => ({
                  title: (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => handleBreadcrumbClick(crumb)}
                      style={{ padding: 0 }}
                    >
                      {crumb.name}
                    </Button>
                  ),
                })),
              ]}
            />
            {selectedPath && (
              <div style={{ fontSize: 12, color: '#1890ff', marginTop: 2 }}>
                已选择: {selectedPath}
              </div>
            )}
          </>
        )}
      </div>

      {/* 操作按钮 */}
      {!isRootLevel && (
        <Space style={{ marginBottom: 8 }}>
          <Button
            size="small"
            icon={<FolderAddOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建文件夹
          </Button>
        </Space>
      )}

      {/* 内容区域 */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : isRootLevel ? (
        mountPoints.length > 0 ? (
          <List
            size="small"
            dataSource={mountPoints}
            renderItem={(item) => (
              <List.Item
                onClick={() => handleMountClick(item.mountPoint)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 4,
                  padding: '6px 12px',
                  background: selectedPath === item.mountPoint ? '#e6f7ff' : 'transparent',
                }}
              >
                <List.Item.Meta
                  avatar={<FolderOutlined style={{ color: '#1890ff' }} />}
                  title={<span style={{ fontSize: 13 }}>{item.mountPoint}</span>}
                  description={
                    <span style={{ fontSize: 11, color: '#999' }}>
                      {item.fsType} · {item.device}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="未发现挂载点" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )
      ) : entries.length > 0 ? (
        <List
          size="small"
          dataSource={entries}
          renderItem={(entry) => (
            <List.Item
              onClick={() => handleEntryClick(entry)}
              style={{
                cursor: 'pointer',
                borderRadius: 4,
                padding: '6px 12px',
                background: selectedPath === entry.path ? '#e6f7ff' : 'transparent',
              }}
              actions={[
                <Popconfirm
                  key="delete"
                  title="确认删除此空文件夹？"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDeleteDir(entry.path);
                  }}
                  onCancel={(e) => {
                    e?.stopPropagation();
                  }}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  >
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={<FolderOutlined style={{ color: '#faad14' }} />}
                title={<span style={{ fontSize: 13 }}>{entry.name}</span>}
                description={<span style={{ fontSize: 11, color: '#999' }}>{entry.path}</span>}
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty description="当前目录为空" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {/* 新建文件夹 Modal */}
      <Modal
        title="新建文件夹"
        open={createModalOpen}
        onOk={handleCreateDir}
        onCancel={() => {
          setCreateModalOpen(false);
          setNewDirName('');
        }}
        confirmLoading={createSubmitting}
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
          将在 {currentPath || '/'} 下创建
        </div>
        <Input
          placeholder="请输入文件夹名称"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={handleCreateDir}
        />
      </Modal>
    </div>
  );
}

export default FolderPicker;
