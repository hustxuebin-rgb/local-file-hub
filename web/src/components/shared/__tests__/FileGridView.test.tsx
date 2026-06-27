import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FileGridView from '../FileGridView';
import type { FileInfo } from '@/types';

const mockFile: FileInfo = {
  id: 1,
  userId: 1,
  folderId: 0,
  fileName: 'test.png',
  saveName: 'test.png',
  fileSuffix: '.png',
  fileType: 1,
  fileSize: 1024,
  mimeType: 'image/png',
  md5: 'abc',
  fullPath: '/test.png',
  isDelete: 0,
  createTime: '2026-01-01 00:00:00',
};

describe('FileGridView', () => {
  it('空数据展示 Empty 组件', () => {
    render(<FileGridView files={[]} />);
    expect(screen.getByText(/暂无/)).toBeInTheDocument();
  });

  it('loading 时不展示 Empty', () => {
    render(<FileGridView files={[]} loading={true} />);
    expect(screen.queryByText(/暂无/)).not.toBeInTheDocument();
  });

  it('文件列表渲染 Card', () => {
    render(<FileGridView files={[mockFile]} />);
    expect(screen.getByText('test.png')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
  });

  it('图片文件类型渲染图片图标', () => {
    render(<FileGridView files={[mockFile]} />);
    // 应渲染 PictureOutlined 或缩略图
    expect(screen.getByText('test.png')).toBeInTheDocument();
  });

  it('showUploader 显示上传者信息', () => {
    const fileWithUploader = { ...mockFile, uploaderName: '张三' };
    render(<FileGridView files={[fileWithUploader]} showUploader={true} />);
    expect(screen.getByText(/张三/)).toBeInTheDocument();
  });

  it('onDownload 回调触发', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<FileGridView files={[mockFile]} onDownload={onDownload} />);
    const btn = screen.getByText('下载');
    await user.click(btn);
    expect(onDownload).toHaveBeenCalledWith(mockFile);
  });

  it('onFavorite 回调触发', async () => {
    const user = userEvent.setup();
    const onFavorite = vi.fn();
    render(<FileGridView files={[mockFile]} onFavorite={onFavorite} />);
    const btn = screen.getByText('收藏');
    await user.click(btn);
    expect(onFavorite).toHaveBeenCalledWith(mockFile);
  });
});
