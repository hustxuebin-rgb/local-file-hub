import { Card, Empty, Tag, Tooltip } from 'antd';
import {
  FileOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import type { FileInfo, PublicFile } from '@/types';

export type GridFileItem = (FileInfo | PublicFile) & { uploaderName?: string; targetType?: number; targetId?: number; targetName?: string; targetSize?: number };

const FILE_TYPE_ICON_MAP: Record<number, React.ReactNode> = {
  1: <PictureOutlined style={{ fontSize: 48, color: '#1677ff' }} />,
  2: <VideoCameraOutlined style={{ fontSize: 48, color: '#722ed1' }} />,
  4: <FileTextOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
};

function getFileIcon(fileType: number, fileSuffix?: string): React.ReactNode {
  if (FILE_TYPE_ICON_MAP[fileType]) {
    return FILE_TYPE_ICON_MAP[fileType];
  }
  const archiveSuffixes = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
  if (fileSuffix && archiveSuffixes.includes(fileSuffix.toLowerCase())) {
    return <FileZipOutlined style={{ fontSize: 48, color: '#fa8c16' }} />;
  }
  return <FileOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

interface FileGridViewProps {
  files: GridFileItem[];
  loading?: boolean;
  onDownload?: (file: GridFileItem) => void;
  onPreview?: (file: GridFileItem) => void;
  onFavorite?: (file: GridFileItem) => void;
  onRemoveFavorite?: (file: GridFileItem) => void;
  showUploader?: boolean;
}

function FileGridView({
  files,
  loading,
  onDownload,
  onPreview,
  onFavorite,
  onRemoveFavorite,
  showUploader = false,
}: FileGridViewProps): React.ReactNode {
  if (!loading && files.length === 0) {
    return <Empty description="暂无文件" />;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {files.map((file) => {
        const fileName: string = 'targetName' in file && file.targetName ? file.targetName : (file as FileInfo).fileName;
        const fileSize: number = 'targetSize' in file ? (file.targetSize as number) : (file as FileInfo).fileSize;
        const fileSuffix: string | undefined = 'fileSuffix' in file ? (file as FileInfo).fileSuffix : undefined;
        const fileType: number = 'fileType' in file ? (file as FileInfo).fileType : 4;
        const thumbnailUrl = (file as FileInfo).id
          ? `/api/media/thumbnail/${(file as FileInfo).id}`
          : undefined;

        const actions: React.ReactNode[] = [];
        if (onDownload) {
          actions.push(
            <Tooltip key="download" title="下载">
              <span onClick={(e) => { e.stopPropagation(); onDownload(file); }}>下载</span>
            </Tooltip>,
          );
        }
        if (onPreview) {
          actions.push(
            <Tooltip key="preview" title="预览">
              <span onClick={(e) => { e.stopPropagation(); onPreview(file); }}>预览</span>
            </Tooltip>,
          );
        }
        if (onFavorite) {
          actions.push(
            <Tooltip key="favorite" title="收藏">
              <span onClick={(e) => { e.stopPropagation(); onFavorite(file); }}>收藏</span>
            </Tooltip>,
          );
        }
        if (onRemoveFavorite) {
          actions.push(
            <Tooltip key="unfavorite" title="取消收藏">
              <span onClick={(e) => { e.stopPropagation(); onRemoveFavorite(file); }}>取消收藏</span>
            </Tooltip>,
          );
        }

        return (
          <Card
            key={(file as FileInfo).id ?? `${file.targetType}-${file.targetId}`}
            hoverable
            style={{ width: 200 }}
            cover={
              thumbnailUrl ? (
                <div
                  style={{
                    height: 140,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fafafa',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={thumbnailUrl}
                    alt={fileName}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getFileIcon(fileType, fileSuffix)}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: 140,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fafafa',
                  }}
                >
                  {fileType === 6 ? (
                    <FolderOutlined style={{ fontSize: 48, color: '#faad14' }} />
                  ) : (
                    getFileIcon(fileType, fileSuffix)
                  )}
                </div>
              )
            }
            actions={actions.length > 0 ? actions : undefined}
          >
            <Card.Meta
              title={
                <Tooltip title={fileName}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fileName}
                  </div>
                </Tooltip>
              }
              description={
                <div>
                  <Tag>{fileType === 6 ? '文件夹' : fileSuffix}</Tag>
                  {fileSize > 0 && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{formatFileSize(fileSize)}</span>}
                  {showUploader && file.uploaderName && (
                    <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
                      上传者: {file.uploaderName}
                    </div>
                  )}
                </div>
              }
            />
          </Card>
        );
      })}
    </div>
  );
}

export default FileGridView;
