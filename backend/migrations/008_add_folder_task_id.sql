ALTER TABLE `folder` ADD COLUMN `task_id` VARCHAR(64) NULL COMMENT '关联的上传任务ID，手动创建的文件夹为NULL' AFTER `is_public`;
CREATE INDEX idx_folder_task_id ON folder (task_id);
