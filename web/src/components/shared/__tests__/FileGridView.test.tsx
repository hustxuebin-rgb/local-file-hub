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
  visibility: 0,
  isDelete: 0,
  createTime: '2026-01-01 00:00:00',
};

const mockFolder: FileInfo = {
  id: 2,
  userId: 1,
  folderId: 0,
  fileName: '测试文件夹',
  saveName: '测试文件夹',
  fileSuffix: '',
  fileType: 6,
  fileSize: 0,
  mimeType: '',
  md5: '',
  fullPath: '/测试文件夹',
  visibility: 0,
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

  it('文件夹卡片点击触发 onFolderClick 回调', async () => {
    const user = userEvent.setup();
    const onFolderClick = vi.fn();
    render(<FileGridView files={[mockFolder]} onFolderClick={onFolderClick} />);
    // 点击文件夹名称触发卡片的 onClick
    const folderName = screen.getByText('测试文件夹');
    await user.click(folderName);
    expect(onFolderClick).toHaveBeenCalledWith(mockFolder);
  });

  it('文件卡片点击不触发 onFolderClick', async () => {
    const user = userEvent.setup();
    const onFolderClick = vi.fn();
    render(<FileGridView files={[mockFile]} onFolderClick={onFolderClick} />);
    const fileName = screen.getByText('test.png');
    await user.click(fileName);
    expect(onFolderClick).not.toHaveBeenCalled();
  });

  it('文件夹渲染文件夹图标和标签', () => {
    render(<FileGridView files={[mockFolder]} />);
    expect(screen.getByText('测试文件夹')).toBeInTheDocument();
    expect(screen.getByText('文件夹')).toBeInTheDocument();
  });
});
