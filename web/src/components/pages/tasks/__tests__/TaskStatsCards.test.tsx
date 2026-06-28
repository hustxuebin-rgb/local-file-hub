import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TaskStatsCards from '../TaskStatsCards';
import type { TaskStats } from '@/types';

const mockStats: TaskStats = {
  upload: { count: 12, totalSize: 524288000, avgSpeed: 1048576 },
  download: { count: 5, totalSize: 104857600, avgSpeed: 524288 },
};

describe('TaskStatsCards', () => {
  it('should render all 4 stat cards with data', () => {
    render(<TaskStatsCards stats={mockStats} />);

    expect(screen.getByText('今日上传')).toBeInTheDocument();
    expect(screen.getByText('今日下载')).toBeInTheDocument();
    expect(screen.getByText('上传总量')).toBeInTheDocument();
    expect(screen.getByText('平均速度')).toBeInTheDocument();

    // Check values
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should render with null stats showing zero values', () => {
    render(<TaskStatsCards stats={null} />);

    expect(screen.getByText('今日上传')).toBeInTheDocument();
    // Zero values
    expect(screen.getAllByText('0')[0]).toBeInTheDocument();
  });

  it('should render with empty stats object', () => {
    const emptyStats: TaskStats = {
      upload: { count: 0, totalSize: 0, avgSpeed: 0 },
      download: { count: 0, totalSize: 0, avgSpeed: 0 },
    };
    render(<TaskStatsCards stats={emptyStats} />);
    expect(screen.getByText('今日上传')).toBeInTheDocument();
    expect(screen.getByText('今日下载')).toBeInTheDocument();
  });
});
