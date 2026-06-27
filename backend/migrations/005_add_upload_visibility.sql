ALTER TABLE `upload_task` ADD COLUMN `visibility` TINYINT NOT NULL DEFAULT 0 COMMENT '可见性: 0=私有, 1=公共' AFTER `folder_id`;
