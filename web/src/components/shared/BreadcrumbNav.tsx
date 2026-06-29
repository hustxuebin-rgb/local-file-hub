import { Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

interface BreadcrumbItem {
  id: number | null;
  name: string;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  onClick: (index: number) => void;
}

function BreadcrumbNav({ items, onClick }: BreadcrumbNavProps): React.ReactNode {
  const breadcrumbItems = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const isFirst = index === 0;

    return {
      key: `item-${item.id ?? index}`,
      title: item.name,
      ...(isFirst && { icon: <HomeOutlined /> }),
      ...(!isLast && { onClick: () => onClick(index) }),
    };
  });

  return <Breadcrumb items={breadcrumbItems} />;
}

export default BreadcrumbNav;
export type { BreadcrumbItem, BreadcrumbNavProps };
