-- ============================================================
-- local-file-hub 初始化数据库脚本
-- 版本: 001
-- 引擎: InnoDB | 字符集: utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS `local_file_hub`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE `local_file_hub`;

-- ------------------------------------------------------------
-- 1. sys_user 用户表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_user` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    `username`      VARCHAR(50)  NOT NULL COMMENT '用户名(登录)',
    `password`      VARCHAR(100) NOT NULL COMMENT '密码(哈希)',
    `nickname`      VARCHAR(50)  NOT NULL COMMENT '昵称',
    `role`          TINYINT      NOT NULL DEFAULT 2 COMMENT '角色: 1=管理员, 2=普通用户',
    `storage_root`  VARCHAR(255) NOT NULL COMMENT '存储根目录路径',
    `storage_quota` BIGINT       NOT NULL DEFAULT 107374182400 COMMENT '存储配额(字节), 默认100G',
    `used_size`     BIGINT       NOT NULL DEFAULT 0 COMMENT '已用空间(字节)',
    `wx_bind`       VARCHAR(100)          DEFAULT NULL COMMENT '微信绑定标识',
    `avatar_url`    VARCHAR(512)          DEFAULT NULL COMMENT '头像地址',
    `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 0=禁用, 1=正常',
    `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_username` (`username`),
    UNIQUE INDEX `uk_storage_root` (`storage_root`),
    UNIQUE INDEX `uk_wx_bind` (`wx_bind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ------------------------------------------------------------
-- 2. sys_device 设备表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_device` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '设备ID',
    `user_id`         BIGINT       NOT NULL COMMENT '所属用户ID',
    `device_type`     TINYINT      NOT NULL COMMENT '设备类型: 1=PC, 2=手机, 3=平板, 4=其他',
    `device_name`     VARCHAR(100) NOT NULL DEFAULT '' COMMENT '设备名称',
    `local_ip`        VARCHAR(50)  NOT NULL COMMENT '设备局域网IP',
    `token`           VARCHAR(255) NOT NULL COMMENT '设备认证Token',
    `online`          TINYINT      NOT NULL DEFAULT 0 COMMENT '在线状态: 0=离线, 1=在线',
    `last_login_time` DATETIME              DEFAULT NULL COMMENT '最后登录时间',
    `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    INDEX `idx_user_id` (`user_id`),
    CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备表';

-- ------------------------------------------------------------
-- 3. storage_disk 存储盘表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `storage_disk` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '磁盘ID',
    `disk_type`      TINYINT      NOT NULL COMMENT '磁盘类型: 1=主盘, 2=备份盘',
    `disk_path`      VARCHAR(500) NOT NULL COMMENT '磁盘路径',
    `total_size`     BIGINT       NOT NULL DEFAULT 0 COMMENT '总空间(字节)',
    `used_size`      BIGINT       NOT NULL DEFAULT 0 COMMENT '已用空间(字节)',
    `available_size` BIGINT       NOT NULL DEFAULT 0 COMMENT '可用空间(字节)',
    `status`         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 0=离线, 1=正常, 2=只读',
    `remark`         VARCHAR(200) NOT NULL DEFAULT '' COMMENT '备注',
    `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_disk_type` (`disk_type`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='存储盘表';

-- ------------------------------------------------------------
-- 4. storage_sync_task 存储同步任务表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `storage_sync_task` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '任务ID',
    `sync_mode`        TINYINT      NOT NULL COMMENT '同步模式: 1=增量, 2=全量',
    `cron_expr`        VARCHAR(50)  NOT NULL COMMENT 'Cron表达式',
    `ignore_suffix`    VARCHAR(500) NOT NULL DEFAULT '' COMMENT '忽略后缀, 逗号分隔',
    `speed_limit`      BIGINT                DEFAULT NULL COMMENT '速度限制(字节/秒), NULL=不限',
    `last_sync_time`   DATETIME              DEFAULT NULL COMMENT '上次同步时间',
    `last_sync_result` TINYINT               DEFAULT NULL COMMENT '上次同步结果: 0=失败, 1=成功',
    `is_running`       TINYINT      NOT NULL DEFAULT 0 COMMENT '是否运行中: 0=否, 1=是',
    `create_time`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_is_running` (`is_running`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='存储同步任务表';

-- ------------------------------------------------------------
-- 5. folder 文件夹表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `folder` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '文件夹ID',
    `user_id`     BIGINT       NOT NULL COMMENT '所属用户ID',
    `parent_id`   BIGINT       NOT NULL DEFAULT 0 COMMENT '父文件夹ID, 0=根目录',
    `folder_name` VARCHAR(100) NOT NULL COMMENT '文件夹名称',
    `full_path`   VARCHAR(500) NOT NULL COMMENT '完整路径',
    `is_public`   TINYINT               DEFAULT NULL COMMENT '是否公开: NULL=继承, 0=私有, 1=公开',
    `sort`        INT          NOT NULL DEFAULT 0 COMMENT '排序值',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_user_parent` (`user_id`, `parent_id`),
    UNIQUE INDEX `uk_user_parent_name` (`user_id`, `parent_id`, `folder_name`),
    CONSTRAINT `fk_folder_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件夹表';

-- ------------------------------------------------------------
-- 6. file_info 文件信息表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `file_info` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '文件ID',
    `user_id`        BIGINT       NOT NULL COMMENT '所属用户ID',
    `folder_id`      BIGINT       NOT NULL DEFAULT 0 COMMENT '所属文件夹ID',
    `file_name`      VARCHAR(255) NOT NULL COMMENT '原始文件名',
    `save_name`      VARCHAR(255) NOT NULL COMMENT '存储文件名(UUID)',
    `file_suffix`    VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '文件后缀',
    `file_type`      TINYINT      NOT NULL COMMENT '文件类型: 1=图片, 2=视频, 3=音频, 4=文档, 5=其他',
    `file_size`      BIGINT       NOT NULL DEFAULT 0 COMMENT '文件大小(字节)',
    `mime_type`      VARCHAR(127)          DEFAULT NULL COMMENT 'MIME类型',
    `md5`            VARCHAR(32)  NOT NULL COMMENT '文件MD5',
    `full_path`      VARCHAR(500) NOT NULL COMMENT '完整路径',
    `thumbnail_path` VARCHAR(500)          DEFAULT NULL COMMENT '缩略图路径',
    `preview_path`   VARCHAR(500)          DEFAULT NULL COMMENT '预览文件路径',
    `source_device`  TINYINT               DEFAULT NULL COMMENT '来源设备类型',
    `is_delete`      TINYINT      NOT NULL DEFAULT 0 COMMENT '是否删除: 0=否, 1=是(回收站)',
    `delete_time`    DATETIME              DEFAULT NULL COMMENT '删除时间',
    `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    INDEX `idx_user_folder` (`user_id`, `folder_id`),
    INDEX `idx_md5` (`md5`),
    CONSTRAINT `fk_file_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件信息表';

-- ------------------------------------------------------------
-- 7. upload_task 上传任务表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `upload_task` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '上传任务ID',
    `user_id`        BIGINT       NOT NULL COMMENT '用户ID',
    `task_id`        VARCHAR(64)  NOT NULL COMMENT '上传任务唯一标识',
    `file_name`      VARCHAR(255) NOT NULL COMMENT '文件名',
    `total_size`     BIGINT       NOT NULL DEFAULT 0 COMMENT '文件总大小(字节)',
    `chunk_size`     INT          NOT NULL DEFAULT 0 COMMENT '分片大小(字节)',
    `total_chunk`    INT          NOT NULL DEFAULT 0 COMMENT '总分片数',
    `finished_chunk` INT          NOT NULL DEFAULT 0 COMMENT '已完成分片数',
    `folder_id`      BIGINT       NOT NULL DEFAULT 0 COMMENT '目标文件夹ID',
    `status`         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 1=上传中, 2=已完成, 3=失败',
    `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_task_id` (`task_id`),
    INDEX `idx_user_id` (`user_id`),
    CONSTRAINT `fk_upload_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='上传任务表';

-- ------------------------------------------------------------
-- 8. share_record 分享记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `share_record` (
    `id`             BIGINT   NOT NULL AUTO_INCREMENT COMMENT '分享记录ID',
    `share_type`     TINYINT  NOT NULL COMMENT '分享类型: 1=文件, 2=文件夹',
    `resource_id`    BIGINT   NOT NULL COMMENT '资源ID(文件ID或文件夹ID)',
    `share_user_id`  BIGINT   NOT NULL COMMENT '分享者用户ID',
    `receive_user_id` BIGINT  NOT NULL COMMENT '接收者用户ID',
    `share_perm`     TINYINT  NOT NULL DEFAULT 1 COMMENT '分享权限: 1=只读, 2=可编辑',
    `expire_type`    TINYINT  NOT NULL DEFAULT 1 COMMENT '过期类型: 1=永不过期, 2=定时过期',
    `expire_time`    DATETIME          DEFAULT NULL COMMENT '过期时间',
    `status`         TINYINT  NOT NULL DEFAULT 1 COMMENT '状态: 0=取消, 1=生效',
    `create_time`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_share_user` (`share_user_id`),
    INDEX `idx_receive_user` (`receive_user_id`),
    INDEX `idx_resource_type` (`resource_id`, `share_type`),
    CONSTRAINT `fk_share_share_user` FOREIGN KEY (`share_user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_share_receive_user` FOREIGN KEY (`receive_user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享记录表';

-- ------------------------------------------------------------
-- 9. sys_operation_log 操作日志表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_operation_log` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '日志ID',
    `user_id`       BIGINT                DEFAULT NULL COMMENT '操作者用户ID',
    `device_id`     BIGINT                DEFAULT NULL COMMENT '操作设备ID',
    `oper_type`     TINYINT      NOT NULL COMMENT '操作类型: 1=上传, 2=下载, 3=删除, 4=分享, 5=登录, 6=其他',
    `resource_type` TINYINT               DEFAULT NULL COMMENT '资源类型: 1=文件, 2=文件夹',
    `resource_id`   BIGINT                DEFAULT NULL COMMENT '资源ID',
    `target_user_id` BIGINT               DEFAULT NULL COMMENT '目标用户ID',
    `oper_desc`     VARCHAR(500) NOT NULL DEFAULT '' COMMENT '操作描述',
    `local_ip`      VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '操作IP',
    `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    INDEX `idx_user_time` (`user_id`, `create_time`),
    INDEX `idx_oper_time` (`oper_type`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- ------------------------------------------------------------
-- 10. sys_warn_log 告警日志表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_warn_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '告警日志ID',
    `warn_type`   TINYINT       NOT NULL COMMENT '告警类型: 1=磁盘告警, 2=同步异常, 3=系统异常',
    `warn_content` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '告警内容',
    `is_read`     TINYINT       NOT NULL DEFAULT 0 COMMENT '是否已读: 0=未读, 1=已读',
    `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    INDEX `idx_warn_type` (`warn_type`),
    INDEX `idx_is_read` (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警日志表';

