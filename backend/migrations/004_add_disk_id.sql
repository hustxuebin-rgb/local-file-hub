ALTER TABLE `sys_user` ADD COLUMN `disk_id` BIGINT DEFAULT NULL COMMENT '绑定的存储盘ID' AFTER `role`;

-- 回滚:
-- ALTER TABLE `sys_user` DROP COLUMN `disk_id`;
