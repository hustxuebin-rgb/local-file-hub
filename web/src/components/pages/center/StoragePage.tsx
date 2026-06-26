import React from 'react';
import { Card, Progress, Descriptions, Statistic, Row, Col } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';

function StoragePage(): React.ReactNode {
  const { user } = useAuthStore();

  if (!user) {
    return <Card title="存储配额">请先登录</Card>;
  }

  const usedSize = user.usedSize;
  const quota = user.storageQuota; // bytes
  const usedPercent = quota > 0 ? Math.min(100, Math.round((usedSize / quota) * 100)) : 0;
  const availableBytes = Math.max(0, quota - usedSize);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const getProgressStatus = (percent: number): 'success' | 'active' | 'exception' => {
    if (percent >= 95) return 'exception';
    if (percent >= 75) return 'active';
    return 'success';
  };

  const getQuotaDisplay = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024)
      return { value: parseFloat((bytes / 1024 / 1024 / 1024).toFixed(1)), suffix: 'GB' };
    if (bytes >= 1024 * 1024)
      return { value: parseFloat((bytes / 1024 / 1024).toFixed(1)), suffix: 'MB' };
    if (bytes >= 1024)
      return { value: parseFloat((bytes / 1024).toFixed(1)), suffix: 'KB' };
    return { value: bytes, suffix: 'B' };
  };

  const quotaDisplay = getQuotaDisplay(quota);
  const usedDisplay = getQuotaDisplay(usedSize);
  const availDisplay = getQuotaDisplay(availableBytes);

  return (
    <Card title={<span><DatabaseOutlined /> 存储配额</span>}>
      <Row gutter={24}>
        <Col span={8}>
          <Card>
            <Statistic title="存储配额" value={quotaDisplay.value} suffix={quotaDisplay.suffix} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="已使用" value={usedDisplay.value} suffix={usedDisplay.suffix} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="可用空间" value={availDisplay.value} suffix={availDisplay.suffix} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="使用率">
            <Progress
              percent={usedPercent}
              status={getProgressStatus(usedPercent)}
              format={(p) => `${p}%`}
            />
          </Descriptions.Item>
          <Descriptions.Item label="存储根目录">{user.storageRoot}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Card>
  );
}

export default StoragePage;
