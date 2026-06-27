import { Dropdown, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { SortOption } from '@/types';

const SORT_OPTIONS: { key: string; label: string; field: SortOption['field']; order: SortOption['order'] }[] = [
  { key: 'name-asc', label: '文件名称 ↑', field: 'name', order: 'asc' },
  { key: 'name-desc', label: '文件名称 ↓', field: 'name', order: 'desc' },
  { key: 'fileSize-asc', label: '文件大小 ↑', field: 'fileSize', order: 'asc' },
  { key: 'fileSize-desc', label: '文件大小 ↓', field: 'fileSize', order: 'desc' },
  { key: 'fileType-asc', label: '文件类型 ↑', field: 'fileType', order: 'asc' },
  { key: 'fileType-desc', label: '文件类型 ↓', field: 'fileType', order: 'desc' },
  { key: 'createTime-asc', label: '上传时间 ↑', field: 'createTime', order: 'asc' },
  { key: 'createTime-desc', label: '上传时间 ↓', field: 'createTime', order: 'desc' },
];

const CURRENT_LABEL_MAP: Record<string, string> = {
  'name-asc': '文件名称 ↑',
  'name-desc': '文件名称 ↓',
  'fileSize-asc': '文件大小 ↑',
  'fileSize-desc': '文件大小 ↓',
  'fileType-asc': '文件类型 ↑',
  'fileType-desc': '文件类型 ↓',
  'createTime-asc': '上传时间 ↑',
  'createTime-desc': '上传时间 ↓',
};

interface FileSortDropdownProps {
  value: SortOption;
  onChange: (sort: SortOption) => void;
}

function FileSortDropdown({ value, onChange }: FileSortDropdownProps): React.ReactNode {
  const currentKey = `${value.field}-${value.order}`;

  const menuItems: MenuProps['items'] = SORT_OPTIONS.map((opt) => ({
    key: opt.key,
    label: opt.label,
    icon: opt.order === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />,
  }));

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const opt = SORT_OPTIONS.find((o) => o.key === key);
    if (opt) {
      onChange({ field: opt.field, order: opt.order });
    }
  };

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }}>
      <Button>
        {CURRENT_LABEL_MAP[currentKey] ?? '排序'}
      </Button>
    </Dropdown>
  );
}

export default FileSortDropdown;
