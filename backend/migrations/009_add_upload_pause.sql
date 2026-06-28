-- 009_add_upload_pause.sql
-- 为 upload_task 表新增断点续传与暂停恢复相关字段

ALTER TABLE `upload_task` ADD COLUMN `md5` VARCHAR(32) DEFAULT '' COMMENT '文件MD5';
ALTER TABLE `upload_task` ADD COLUMN `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间';
ALTER TABLE `upload_task` ADD COLUMN `pause_time` DATETIME DEFAULT NULL COMMENT '暂停时间';

-- 状态注释扩展:
-- status: 1=上传中, 2=合并中, 3=已完成, 4=已取消, 5=已暂停
