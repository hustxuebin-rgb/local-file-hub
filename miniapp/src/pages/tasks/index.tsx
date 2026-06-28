import { View, Text } from '@tarojs/components';
import { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { Loading, Empty, Progress } from '@nutui/nutui-react-taro';
import { getTasksList } from '../../utils/api';
import type { TaskItem } from '../../utils/api';
import './index.scss';

const STATUS_MAP: Record<number, { label: string; className: string }> = {
  0: { label: '等待中', className: 'tasks-page__task-status--pending' },
  1: { label: '进行中', className: 'tasks-page__task-status--processing' },
  2: { label: '已暂停', className: 'tasks-page__task-status--paused' },
  3: { label: '已完成', className: 'tasks-page__task-status--completed' },
  4: { label: '失败', className: 'tasks-page__task-status--failed' },
  5: { label: '已取消', className: 'tasks-page__task-status--cancelled' },
};

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getProgressPercent(item: TaskItem): number {
  if (item.totalSize <= 0) return 0;
  const pct = Math.round((item.finishedSize / item.totalSize) * 100);
  return Math.min(100, Math.max(0, pct));
}

interface TasksPageProps {}

function TasksPage(_props: TasksPageProps): JSX.Element {
  const [uploadTasks, setUploadTasks] = useState<TaskItem[]>([]);
  const [downloadTasks, setDownloadTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const res = await getTasksList();
      setUploadTasks(res.uploadTasks || []);
      setDownloadTasks(res.downloadTasks || []);
    } catch (err) {
      console.error('加载任务列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    setLoading(true);
    loadTasks();
  });

  usePullDownRefresh(async () => {
    await loadTasks();
    Taro.stopPullDownRefresh();
  });

  const renderTaskItem = (item: TaskItem): JSX.Element => {
    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP[0];
    const percent = getProgressPercent(item);

    return (
      <View key={item.taskId} className="tasks-page__task-item">
        <View className="tasks-page__task-header">
          <Text className="tasks-page__task-name">{item.fileName}</Text>
          <Text className={`tasks-page__task-status ${statusInfo.className}`}>
            {statusInfo.label}
          </Text>
        </View>
        <View className="tasks-page__task-progress">
          <Progress percent={percent} showText />
        </View>
        <View className="tasks-page__task-meta">
          <Text>{formatFileSize(item.finishedSize)} / {formatFileSize(item.totalSize)}</Text>
          <Text>{item.updateTime?.slice(0, 16) || ''}</Text>
        </View>
      </View>
    );
  };

  const renderSection = (title: string, icon: string, tasks: TaskItem[]): JSX.Element => (
    <View className="tasks-page__section">
      <View className="tasks-page__section-header">
        <Text className="section-icon">{icon}</Text>
        <Text className="section-title">{title}</Text>
        <Text className="section-count">({tasks.length})</Text>
      </View>
      {tasks.map((item) => renderTaskItem(item))}
    </View>
  );

  if (loading) {
    return (
      <View className="tasks-page">
        <View className="tasks-page__loading">
          <Loading>加载中...</Loading>
        </View>
      </View>
    );
  }

  const isEmpty = uploadTasks.length === 0 && downloadTasks.length === 0;

  if (isEmpty) {
    return (
      <View className="tasks-page">
        <View className="tasks-page__empty">
          <Empty description="没有进行中的任务" />
        </View>
      </View>
    );
  }

  return (
    <View className="tasks-page">
      {uploadTasks.length > 0 && renderSection('上传任务', '📤', uploadTasks)}
      {downloadTasks.length > 0 && renderSection('下载任务', '📥', downloadTasks)}
    </View>
  );
}

export default TasksPage;
