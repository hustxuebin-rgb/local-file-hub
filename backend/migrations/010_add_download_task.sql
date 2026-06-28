-- 010_add_download_task.sql
-- 创建下载任务表，支持下载暂停/恢复追踪

CREATE TABLE IF NOT EXISTS `download_task` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '下载任务ID',
    `user_id`         BIGINT       NOT NULL COMMENT '用户ID',
    `task_id`         VARCHAR(64)  NOT NULL COMMENT '下载任务唯一标识',
    `file_id`         BIGINT       NOT NULL COMMENT '关联文件ID',
    `file_name`       VARCHAR(255) NOT NULL COMMENT '文件名',
    `total_size`      BIGINT       NOT NULL DEFAULT 0 COMMENT '文件总大小',
    `downloaded_size` BIGINT       NOT NULL DEFAULT 0 COMMENT '已下载大小(字节)',
    `status`          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 1=下载中, 2=已完成, 3=已暂停, 4=已取消, 5=失败',
    `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_task_id` (`task_id`),
    INDEX `idx_user_file` (`user_id`, `file_id`),
    CONSTRAINT `fk_download_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_download_file` FOREIGN KEY (`file_id`) REFERENCES `file_info` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='下载任务表';
