import { Segmented } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useViewStore } from '@/stores/useViewStore';
import type { ViewMode } from '@/types';

function FileViewToggle(): React.ReactNode {
  const { viewMode, setViewMode } = useViewStore();

  return (
    <Segmented
      value={viewMode}
      onChange={(value) => setViewMode(value as ViewMode)}
      options={[
        { label: '列表', value: 'list', icon: <UnorderedListOutlined /> },
        { label: '图标', value: 'grid', icon: <AppstoreOutlined /> },
      ]}
    />
  );
}

export default FileViewToggle;
