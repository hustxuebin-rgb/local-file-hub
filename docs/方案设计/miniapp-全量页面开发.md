# 微信小程序全量页面开发方案

## 1. 项目概述

使用 Taro 3 + React + TypeScript + NutUI 在 `miniapp/` 目录下创建微信小程序，作为 local-file-hub 的移动端入口。

## 2. 技术选型

| 项目 | 选择 |
|------|------|
| 框架 | Taro 3 (React) |
| 语言 | TypeScript (strict mode) |
| UI 组件库 | NutUI React Taro |
| 样式 | SCSS + rpx (375 基准) |
| 包管理 | npm |

## 3. API 接口清单

### 3.1 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，body: `{username, password, deviceType:2}` → `{token, user, deviceId}` |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/current_user` | 获取当前用户 |

### 3.2 文件/文件夹
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/folder/list?parent_id=` | 文件夹列表 |
| POST | `/api/folder` | 创建文件夹 |
| GET | `/api/file/list?folderId=&page=&pageSize=` | 文件列表 |
| DELETE | `/api/file/:id` | 删除文件 |

### 3.3 分享
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/share` | 创建分享 |
| GET | `/api/share/my` | 我的分享 |
| GET | `/api/share/received` | 收到的分享 |
| GET | `/api/share/:id/contents` | 分享内容列表 |
| PUT | `/api/share/:id` | 更新分享 |
| DELETE | `/api/share/:id` | 取消分享 |

### 3.4 小程序专用
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/miniapp/album_upload` | 相册上传 |
| POST | `/api/miniapp/camera_upload` | 拍照上传 |
| GET | `/api/miniapp/storage_stat` | 存储统计 |

### 3.5 媒体
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/media/thumbnail/:fileId` | 缩略图 |
| GET | `/api/media/video_preview/:fileId` | 视频预览 |

## 4. 路由设计

```typescript
// app.config.ts pages 配置
const pages = [
  'pages/login/index',           // 登录页
  'pages/index/index',           // 首页（我的备份）
  'pages/public/index',          // 公共文件
  'pages/received-shares/index', // 收到的分享
  'pages/share-content/index',   // 分享内容
  'pages/album-upload/index',    // 相册上传
  'pages/camera-upload/index',   // 拍照上传
  'pages/storage-stats/index',   // 存储统计
  'pages/create-share/index',    // 创建分享
];
// tabBar: 首页 / 公共文件 / 收到的分享
```

## 5. 页面功能详述

### 5.1 登录页 `pages/login/index`
- 表单：用户名 + 密码输入（NutUI Cell + Input）
- 登录按钮，调用 `POST /api/auth/login` (deviceType=2)
- 成功：Taro.setStorageSync('token', token) → Taro.switchTab 到首页
- 失败：Toast 提示错误信息

### 5.2 首页（我的备份）`pages/index/index`
- 请求 `GET /api/folder/list?parent_id=` 获取根目录文件夹
- 请求 `GET /api/file/list?folderId=` 获取根目录文件
- 点击文件夹进入子目录（带上 parent_id 重新请求）
- 导航栏右上角 "+" 按钮：新建文件夹/上传入口
- 文件列表项：文件名+大小+时间，点击可预览（图片/视频）

### 5.3 公共文件 `pages/public/index`
- 类似首页，请求公共目录内容
- 只读浏览，无上传/删除操作

### 5.4 收到的分享 `pages/received-shares/index`
- 调用 `GET /api/share/received`
- 列表展示分享记录（分享人、权限、过期时间）
- 点击进入 `share-content` 页面查看分享内容
- 区分只读/可上传权限显示不同操作

### 5.5 分享内容 `pages/share-content/index`
- 接收路由参数 `shareId`
- 调用 `GET /api/share/:id/contents`
- 文件列表展示，支持图片/视频预览
- 可上传权限显示上传按钮

### 5.6 相册上传 `pages/album-upload/index`
- 调用 `wx.chooseMedia({ count: 9, mediaType: ['image','video'] })`
- 显示选中文件的预览列表
- 上传按钮 → `POST /api/miniapp/album_upload` (FormData)
- 上传进度条

### 5.7 拍照上传 `pages/camera-upload/index`
- 调用 `wx.chooseMedia({ count: 1, sourceType: ['camera'] })`
- 拍照后预览
- 上传按钮 → `POST /api/miniapp/camera_upload` (FormData)

### 5.8 存储统计 `pages/storage-stats/index`
- 调用 `GET /api/miniapp/storage_stat`
- 显示：已用空间/总配额/使用率（环形进度）
- 文件类型分布统计

### 5.9 创建分享 `pages/create-share/index`
- 传入 resourceId + shareType(1=文件夹/2=文件)
- 选择用户（搜索 `GET /api/user/search`）
- 选择权限（只读/可上传）
- 选择有效期（1天/7天/30天/永久）
- 调用 `POST /api/share` 创建

## 6. 关键工具函数

### 6.1 `src/utils/request.ts`
- 封装 Taro.request
- baseURL 统一配置（常量 config.ts）
- 自动注入 `Authorization: Bearer {token}` 头
- 401 响应 → 清除 token → 跳转登录页
- 统一错误处理

### 6.2 `src/utils/config.ts`
```typescript
export const API_BASE_URL = 'http://192.168.1.xxx:8000'; // 局域网地址
```

## 7. 组件结构

```
src/
├── app.config.ts          # 页面路由 + tabBar 配置
├── app.tsx                # 入口组件
├── app.scss               # 全局样式
├── utils/
│   ├── config.ts          # API 地址等配置
│   ├── request.ts         # 统一请求封装
│   └── api.ts             # API 方法封装
├── pages/
│   ├── login/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── index/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── public/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── received-shares/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── share-content/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── album-upload/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── camera-upload/
│   │   ├── index.tsx
│   │   └── index.scss
│   ├── storage-stats/
│   │   ├── index.tsx
│   │   └── index.scss
│   └── create-share/
│       ├── index.tsx
│       └── index.scss
```

## 8. 执行计划

| 步骤 | 操作 | 产出的文件 |
|------|------|-----------|
| 1 | 初始化 Taro 项目 | miniapp/ 完整项目骨架 |
| 2 | 安装 NutUI 依赖 | package.json 更新 |
| 3 | 创建 utils/config.ts + utils/request.ts + utils/api.ts | 3 个工具文件 |
| 4 | 创建 login 页面 | 1 个页面（4 文件） |
| 5 | 创建 index（首页）页面 | 1 个页面 |
| 6 | 创建 public 页面 | 1 个页面 |
| 7 | 创建 received-shares 页面 | 1 个页面 |
| 8 | 创建 share-content 页面 | 1 个页面 |
| 9 | 创建 album-upload 页面 | 1 个页面 |
| 10 | 创建 camera-upload 页面 | 1 个页面 |
| 11 | 创建 storage-stats 页面 | 1 个页面 |
| 12 | 创建 create-share 页面 | 1 个页面 |
| 13 | 配置 app.config.ts 路由 | 1 个文件 |
| 14 | 验证构建 | npm run build:weapp |

## 9. 风险和注意事项

| 风险点 | 说明 |
|--------|------|
| 构建时 NutUI 按需加载配置 | 需在 config/index.ts 配置 NutUI 按需加载插件 |
| 小程序 TabBar 限制 | 最多 5 个 tab，使用 3 个（首页/公共/收到的分享） |
| 登录态管理 | page 间跳转需检查 token 有效性，未登录跳转登录页 |
| 局域网地址配置 | API_BASE_URL 需可配置，后续可通过设备发现自动获取 |
