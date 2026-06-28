import { Card, Statistic, Row, Col } from 'antd';
import { CloudUploadOutlined, CloudDownloadOutlined, HddOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { TaskStats } from '@/types';
import { formatFileSize, formatSpeed } from '@/utils/format';

interface TaskStatsCardsProps {
  stats: TaskStats | null;
}

function TaskStatsCards({ stats }: TaskStatsCardsProps): React.ReactNode {
  const upload = stats?.upload;
  const download = stats?.download;

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={12} sm={12} md={6}>
        <Card>
          <Statistic
            title="今日上传"
            value={upload?.count ?? 0}
            prefix={<CloudUploadOutlined />}
            suffix="个"
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card>
          <Statistic
            title="今日下载"
            value={download?.count ?? 0}
            prefix={<CloudDownloadOutlined />}
            suffix="个"
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card>
          <Statistic
            title="上传总量"
            value={upload?.totalSize ? formatFileSize(upload.totalSize) : '0 B'}
            prefix={<HddOutlined />}
            styles={{ content: { fontSize: 20 } }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card>
          <Statistic
            title="平均速度"
            value={upload?.avgSpeed ? formatSpeed(upload.avgSpeed) : '0 B/s'}
            prefix={<ThunderboltOutlined />}
            styles={{ content: { fontSize: 20 } }}
          />
        </Card>
      </Col>
    </Row>
  );
}

export default TaskStatsCards;
