import { Tabs } from 'antd';
import type { TabsProps } from 'antd';
import type { FileCategory } from '@/types';

/** 前后端 fileType 映射：1=图片 2=视频 3=音频 4=文档 5=其他 */
const CATEGORIES: FileCategory[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片', fileType: 1 },
  { key: 'video', label: '视频', fileType: 2 },
  { key: 'audio', label: '音频', fileType: 3 },
  { key: 'doc', label: '文档', fileType: 4 },
  { key: 'other', label: '其他', fileType: 5 },
];

interface FileCategoryTabsProps {
  activeKey: string;
  onChange: (key: string, fileType?: number) => void;
}

function FileCategoryTabs({ activeKey, onChange }: FileCategoryTabsProps): React.ReactNode {
  const handleChange = (key: string) => {
    const cat = CATEGORIES.find((c) => c.key === key);
    onChange(key, cat?.fileType);
  };

  const items: TabsProps['items'] = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
  }));

  return (
    <Tabs
      activeKey={activeKey}
      items={items}
      onChange={handleChange}
      style={{ marginBottom: 0 }}
    />
  );
}

export { CATEGORIES };
export default FileCategoryTabs;
