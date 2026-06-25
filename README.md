# local-file-hub

局域网文件传输与备份存储中心。支持 Web 端 + 微信小程序双端访问。

## 定位

本地部署的文件管理中心，核心能力：
- 📁 **局域网文件传输**：浏览器/小程序直接上传、下载、分享文件
- 🎬 **视频/照片管理**：支持视频流播放、照片预览、相册管理
- 💾 **备份存储**：文件自动备份、版本管理、存储空间管理

## 技术栈

| 层级 | 技术选型 |
|------|---------|
| 后端 | Python 3.11+ / FastAPI / SQLAlchemy |
| Web 前端 | React + TypeScript + Vite |
| 小程序 | Taro 3 + React + TypeScript + NutUI |
| 存储 | 本地文件系统 + SQLite（元数据） |
| AI 编码 | Qoder + AI-devflow agent/skill 体系 |

## 目录结构

```
local-file-hub/
├── backend/         # Python FastAPI 后端
│   ├── api/         # API 路由
│   ├── core/        # 核心逻辑（文件管理、传输、备份）
│   ├── storage/     # 存储层（文件系统 + 数据库）
│   └── tests/       # 后端测试
├── web/             # React Web 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   └── tests/
├── miniapp/         # Taro 微信小程序
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   └── tests/
├── .qoder/          # AI 编码元技能体系
│   ├── agents/      # 8 个 Agent（ai-coding, miniapp-coding, code-reviewer 等）
│   ├── skills/      # 11 个 Skill（含 checker 配对）
│   ├── rules/       # 6 个调度规则
│   ├── knowledge/   # 项目知识库
│   └── plans/       # 方案设计文档
└── docs/
    └── 方案设计/     # 各功能方案设计文档
```

## 快速开始

```bash
# 1. 安装后端依赖
cd backend && pip install -r requirements.txt

# 2. 启动后端服务
uvicorn api.main:app --host 0.0.0.0 --port 8000

# 3. 安装 Web 前端依赖
cd web && npm install

# 4. 启动 Web 前端
npm run dev

# 5. 安装小程序依赖
cd miniapp && npm install

# 6. 启动小程序开发
npm run dev:weapp
```

## 开发规范

本项目使用 Qoder AI 编码体系，所有代码变更遵循强制两阶段流程（需求分析 + 方案设计 → 代码生成 + 测试）。

- **后端开发**：自动触发 ai-coding Agent，遵循 Python PEP 8 规范
- **Web 前端开发**：自动触发 ai-coding Agent，遵循 React 编码规范
- **小程序开发**：自动触发 miniapp-coding Agent，遵循 Taro + NutUI 规范
- **代码审查**：自动触发 code-reviewer Agent，P0 问题零容忍
