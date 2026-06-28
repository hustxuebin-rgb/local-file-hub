ALTER TABLE `file_info` ADD COLUMN `task_id` VARCHAR(64) DEFAULT NULL COMMENT '关联的上传任务ID' AFTER `md5`;
CREATE INDEX `idx_task_id` ON `file_info` (`task_id`);
