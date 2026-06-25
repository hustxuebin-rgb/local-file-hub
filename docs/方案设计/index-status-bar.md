# 首页连接状态条

## 功能概述

在首页顶部显示与 `local-file-hub Server` 的连接状态。页面挂载时调用 `GET /api/lan/server_info` 获取 Server 信息，成功显示绿色「已连接」，失败显示红色「未连接」。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/utils/api.ts` | 修改 | 新增 `ServerInfo` 接口 + `getServerInfo()` 函数 |
| `src/pages/index/index.tsx` | 修改 | 新增 state、useEffect、连接状态条 JSX |
| `src/pages/index/index.scss` | 修改 | 新增 `&__status-bar` 样式块 |

## 接口签名

```ts
export interface ServerInfo {
  device_name?: string;
  local_ip?: string;
}

export function getServerInfo(): Promise<ServerInfo> {
  return api.get<ServerInfo>('/api/lan/server_info', { skipErrorToast: true });
}
```

## 数据流

```
useEffect (mount)
  → getServerInfo()
    ├─ 成功 → setServerInfo(data), setConnected(true)
    └─ 失败 → setConnected(false)
  → 渲染 StatusBar
    ├─ connected=true  → 绿色条：「已连接: local-file-hub Server」+ IP
    └─ connected=false → 红色条：「未连接: local-file-hub Server」
```

## 风险点

- `/api/lan/server_info` 是 LAN 接口，需确保后端已实现
- 服务器不可达时 api.get 有 30s 超时，失败走 catch 分支，不影响页面主流程
