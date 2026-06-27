import { Input } from 'antd';
import { useRef, useCallback } from 'react';

const { Search } = Input;

interface FileSearchBarProps {
  onSearch: (keyword: string) => void;
  placeholder?: string;
}

function FileSearchBar({ onSearch, placeholder = '搜索文件' }: FileSearchBarProps): React.ReactNode {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onSearch],
  );

  return (
    <Search
      placeholder={placeholder}
      allowClear
      onChange={handleChange}
      onSearch={onSearch}
      style={{ width: 240 }}
    />
  );
}

export default FileSearchBar;
