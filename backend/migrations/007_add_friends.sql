CREATE TABLE IF NOT EXISTS `friend_relation` (
    `id`          BIGINT   NOT NULL AUTO_INCREMENT COMMENT '关系ID',
    `user_id`     BIGINT   NOT NULL COMMENT '用户ID',
    `friend_id`   BIGINT   NOT NULL COMMENT '好友用户ID',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '成为好友时间',
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_user_friend` (`user_id`, `friend_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_friend_id` (`friend_id`),
    CONSTRAINT `fk_friend_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_friend_friend` FOREIGN KEY (`friend_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表';

CREATE TABLE IF NOT EXISTS `friend_request` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '申请ID',
    `from_user_id` BIGINT      NOT NULL COMMENT '发送方用户ID',
    `to_user_id`  BIGINT       NOT NULL COMMENT '接收方用户ID',
    `status`      TINYINT      NOT NULL DEFAULT 0 COMMENT '状态: 0=待处理, 1=已同意, 2=已拒绝',
    `message`     VARCHAR(200) NOT NULL DEFAULT '' COMMENT '申请附言',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '处理时间',
    PRIMARY KEY (`id`),
    INDEX `idx_to_user_status` (`to_user_id`, `status`),
    INDEX `idx_from_user` (`from_user_id`),
    UNIQUE INDEX `uk_from_to_pending` (`from_user_id`, `to_user_id`, `status`),
    CONSTRAINT `fk_request_from` FOREIGN KEY (`from_user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_request_to` FOREIGN KEY (`to_user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友申请表';
