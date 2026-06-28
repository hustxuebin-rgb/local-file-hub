import React from 'react';
import { Badge } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '@/stores/useTaskStore';

function TaskManagerButton(): React.ReactNode {
  const navigate = useNavigate();
  const activeCount = useTaskStore((s) => s.activeTaskCount());
  const uploadTasks = useTaskStore((s) => s.uploadTasks);
  const downloadTasks = useTaskStore((s) => s.downloadTasks);

  // 订阅任务数组变化以触发 activeCount 重算
  const _uploadLen = uploadTasks.length;
  const _downloadLen = downloadTasks.length;

  return (
    <Badge count={activeCount} size="small" offset={[-2, 2]}>
      <ClockCircleOutlined
        style={{ fontSize: 18, cursor: 'pointer' }}
        onClick={() => navigate('/tasks')}
      />
    </Badge>
  );
}

export default TaskManagerButton;
