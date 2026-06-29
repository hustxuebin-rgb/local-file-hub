import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tabs, Input, Select, Space, message, Alert } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { tasksList, tasksStats, tasksBatch, getUnfinishedUploads } from '@/api/file';
import type { UnifiedTaskItem, UploadTaskInfo } from '@/api/file';
import { useTaskStore } from '@/stores/useTaskStore';
import TaskStatsCards from './TaskStatsCards';
import TaskTable from './TaskTable';
import TaskHistoryTab from './TaskHistoryTab';
import BatchActions from './BatchActions';

type TabKey = 'upload' | 'download' | 'history';

function TaskCenterPage(): React.ReactNode {
  const {
    taskStats,
    setTaskStats,
    selectedTaskIds,
    setSelectedTaskIds,
    toggleSelectTask,
    selectAllTasks,
    clearSelection,
  } = useTaskStore();

  const [activeTab, setActiveTab] = useState<TabKey>('upload');
  const [activeTasks, setActiveTasks] = useState<UnifiedTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [unfinishedCount, setUnfinishedCount] = useState(0);

  // 页面挂载：并发请求 stats + tasksList + 未完成任务恢复
  useEffect(() => {
    setLoading(true);
    Promise.all([tasksStats(), tasksList(), getUnfinishedUploads()])
      .then(([statsRes, tasksRes, unfinishedRes]) => {
        if (statsRes.data) setTaskStats(statsRes.data);
        if (tasksRes.data) {
          let mergedTasks = tasksRes.data;
          if (unfinishedRes.data && unfinishedRes.data.length > 0) {
            setUnfinishedCount(unfinishedRes.data.length);
            const recoveredTasks: UnifiedTaskItem[] = unfinishedRes.data.map(
              (task: UploadTaskInfo): UnifiedTaskItem => ({
                taskId: task.taskId,
                taskType: 'upload',
                fileName: task.fileName,
                filePath: task.filePath,
                totalSize: task.totalSize,
                finishedSize: task.chunkSize * task.finishedChunk,
                totalChunk: task.totalChunk,
                finishedChunk: task.finishedChunk,
                folderId: task.folderId,
                visibility: task.visibility,
                status: task.status,
                progress:
                  task.totalChunk > 0
                    ? Math.round((task.finishedChunk / task.totalChunk) * 100)
                    : 0,
                createTime: task.createTime,
              }),
            );
            const existingIds = new Set(mergedTasks.map((t) => t.taskId));
            const newTasks = recoveredTasks.filter((t) => !existingIds.has(t.taskId));
            mergedTasks = [...newTasks, ...mergedTasks];
          }
          setActiveTasks(mergedTasks);
        }
      })
      .catch(() => {
        // 错误已在 client 拦截器中处理
      })
      .finally(() => setLoading(false));

    return () => {
      clearSelection();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 刷新技术栈数据
  const refreshActiveTasks = useCallback(() => {
    tasksList()
      .then((res) => {
        if (res.data) setActiveTasks(res.data);
      })
      .catch(() => {});
  }, []);

  // 当前 tab 过滤后的任务
  const filteredTasks = useMemo(() => {
    return activeTasks.filter((t) => {
      if (t.taskType !== activeTab) return false;
      if (keyword && !t.fileName.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (statusFilter !== undefined && t.status !== statusFilter) return false;
      return true;
    });
  }, [activeTasks, activeTab, keyword, statusFilter]);

  // 当前 tab 所有任务的 ID 列表（用于全选）
  const currentTabTaskIds = useMemo(() => filteredTasks.map((t) => t.taskId), [filteredTasks]);

  // 搜索防抖
  const handleKeywordChange = useCallback((val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(val);
    }, 300);
  }, []);

  // 批量操作
  const handleBatchAction = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      if (selectedTaskIds.length === 0) {
        message.warning('请先选择任务');
        return;
      }
      setBatchLoading(true);
      try {
        await tasksBatch({
          taskType: activeTab as 'upload' | 'download',
          action,
          taskIds: selectedTaskIds,
        });
        message.success('批量操作已提交');
        clearSelection();
        refreshActiveTasks();
      } catch {
        // 错误已在 client 拦截器中处理
      } finally {
        setBatchLoading(false);
      }
    },
    [selectedTaskIds, activeTab, clearSelection, refreshActiveTasks],
  );

  const handleSinglePause = useCallback(
    async (task: UnifiedTaskItem) => {
      try {
        await tasksBatch({ taskType: task.taskType, action: 'pause', taskIds: [task.taskId] });
        message.success('已暂停');
        refreshActiveTasks();
      } catch {
        // ignore
      }
    },
    [refreshActiveTasks],
  );

  const handleSingleResume = useCallback(
    async (task: UnifiedTaskItem) => {
      try {
        await tasksBatch({ taskType: task.taskType, action: 'resume', taskIds: [task.taskId] });
        message.success('已恢复');
        refreshActiveTasks();
      } catch {
        // ignore
      }
    },
    [refreshActiveTasks],
  );

  const handleSingleCancel = useCallback(
    async (task: UnifiedTaskItem) => {
      try {
        await tasksBatch({ taskType: task.taskType, action: 'cancel', taskIds: [task.taskId] });
        message.success('已取消');
        clearSelection();
        refreshActiveTasks();
      } catch {
        // ignore
      }
    },
    [refreshActiveTasks, clearSelection],
  );

  const activeCounts = useMemo(() => {
    let upload = 0;
    let download = 0;
    activeTasks.forEach((t) => {
      if (t.taskType === 'upload') upload++;
      else if (t.taskType === 'download') download++;
    });
    return { upload, download };
  }, [activeTasks]);

  const tabItems = [
    {
      key: 'upload' as TabKey,
      label: `上传中 (${activeCounts.upload})`,
      children: (
        <div>
          <Space style={{ marginBottom: 12 }} wrap>
            <Input
              placeholder="搜索文件名"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 240 }}
              onChange={(e) => handleKeywordChange(e.target.value)}
            />
            <Select
              placeholder="状态筛选"
              allowClear
              style={{ width: 120 }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { label: '全部', value: undefined },
                { label: '等待中', value: 0 },
                { label: '进行中', value: 1 },
                { label: '已暂停', value: 2 },
                { label: '已完成', value: 3 },
                { label: '失败', value: 4 },
              ]}
            />
          </Space>
          <TaskTable
            tasks={filteredTasks}
            loading={loading}
            selectedTaskIds={selectedTaskIds}
            onSelectChange={setSelectedTaskIds}
            onPause={handleSinglePause}
            onResume={handleSingleResume}
            onCancel={handleSingleCancel}
          />
          <BatchActions
            selectedCount={selectedTaskIds.length}
            totalCount={filteredTasks.length}
            loading={batchLoading}
            onSelectAll={() => selectAllTasks(currentTabTaskIds)}
            onBatchPause={() => handleBatchAction('pause')}
            onBatchResume={() => handleBatchAction('resume')}
            onBatchCancel={() => handleBatchAction('cancel')}
          />
        </div>
      ),
    },
    {
      key: 'download' as TabKey,
      label: `下载中 (${activeCounts.download})`,
      children: (
        <div>
          <Space style={{ marginBottom: 12 }} wrap>
            <Input
              placeholder="搜索文件名"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 240 }}
              onChange={(e) => handleKeywordChange(e.target.value)}
            />
            <Select
              placeholder="状态筛选"
              allowClear
              style={{ width: 120 }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { label: '全部', value: undefined },
                { label: '等待中', value: 0 },
                { label: '进行中', value: 1 },
                { label: '已暂停', value: 2 },
                { label: '已完成', value: 3 },
                { label: '失败', value: 4 },
              ]}
            />
          </Space>
          <TaskTable
            tasks={filteredTasks}
            loading={loading}
            selectedTaskIds={selectedTaskIds}
            onSelectChange={setSelectedTaskIds}
            onPause={handleSinglePause}
            onResume={handleSingleResume}
            onCancel={handleSingleCancel}
          />
          <BatchActions
            selectedCount={selectedTaskIds.length}
            totalCount={filteredTasks.length}
            loading={batchLoading}
            onSelectAll={() => selectAllTasks(currentTabTaskIds)}
            onBatchPause={() => handleBatchAction('pause')}
            onBatchResume={() => handleBatchAction('resume')}
            onBatchCancel={() => handleBatchAction('cancel')}
          />
        </div>
      ),
    },
    {
      key: 'history' as TabKey,
      label: '历史记录',
      children: <TaskHistoryTab />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>任务中心</h2>
      {unfinishedCount > 0 && (
        <Alert
          type="warning"
          showIcon
          closable
          message={`检测到 ${unfinishedCount} 个未完成的上传任务`}
          description={
            <span>
              刷新页面后需重新选择文件才能恢复上传。请切换到
              <a onClick={() => setActiveTab('upload')}>「上传中」</a>
              Tab 查看可恢复的任务。
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <TaskStatsCards stats={taskStats} />
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key as TabKey);
          clearSelection();
          setKeyword('');
          setStatusFilter(undefined);
        }}
        items={tabItems}
      />
    </div>
  );
}

export default TaskCenterPage;
