-- 011_add_download_file_path.sql
-- 为 download_task 表添加 file_path 字段（下载保存路径）

ALTER TABLE download_task ADD COLUMN file_path VARCHAR(1024) DEFAULT '' COMMENT '下载保存路径';
