import { Space, Button, Popconfirm } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, CloseOutlined, CheckSquareOutlined } from '@ant-design/icons';

interface BatchActionsProps {
  selectedCount: number;
  totalCount: number;
  loading: boolean;
  onSelectAll: () => void;
  onBatchPause: () => void;
  onBatchResume: () => void;
  onBatchCancel: () => void;
}

function BatchActions({
  selectedCount,
  totalCount,
  loading,
  onSelectAll,
  onBatchPause,
  onBatchResume,
  onBatchCancel,
}: BatchActionsProps): React.ReactNode {
  if (totalCount === 0) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: '8px 12px',
        background: selectedCount > 0 ? '#e6f7ff' : '#fafafa',
        borderRadius: 6,
        border: selectedCount > 0 ? '1px solid #91d5ff' : '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Space>
        <Button size="small" icon={<CheckSquareOutlined />} onClick={onSelectAll}>
          全选
        </Button>
        <Popconfirm
          title="批量暂停"
          description={`确定暂停选中的 ${selectedCount} 个任务？`}
          onConfirm={onBatchPause}
          disabled={selectedCount === 0}
        >
          <Button
            size="small"
            icon={<PauseCircleOutlined />}
            disabled={selectedCount === 0 || loading}
          >
            批量暂停
          </Button>
        </Popconfirm>
        <Popconfirm
          title="批量恢复"
          description={`确定恢复选中的 ${selectedCount} 个任务？`}
          onConfirm={onBatchResume}
          disabled={selectedCount === 0}
        >
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            disabled={selectedCount === 0 || loading}
          >
            批量恢复
          </Button>
        </Popconfirm>
        <Popconfirm
          title="批量取消"
          description={`确定取消选中的 ${selectedCount} 个任务？此操作不可撤销。`}
          onConfirm={onBatchCancel}
          disabled={selectedCount === 0}
        >
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            disabled={selectedCount === 0 || loading}
          >
            批量取消
          </Button>
        </Popconfirm>
      </Space>
      <span style={{ color: '#888', fontSize: 12 }}>
        {selectedCount > 0 ? `已选 ${selectedCount} 项` : `共 ${totalCount} 项`}
      </span>
    </div>
  );
}

export default BatchActions;
