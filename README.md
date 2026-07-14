# FWQGO（服务器go）

FWQGO 是一个面向服务器、VPS 和云产品优惠内容的双应用平台。公开站负责中文/英文内容、服务器套餐专题和 SEO，独立 CMS 负责采集、AI 改写、文章审核、媒体资产、返利链接与运营配置。

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-149ECA?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

## 应用架构

| 应用 | 目录       | 默认端口 | 生产域名                | 数据库职责                                 |
| ---- | ---------- | -------: | ----------------------- | ------------------------------------------ |
| Web  | `apps/web` |   `3000` | `https://fwqgo.com`     | 公开内容使用只读连接；必要的埋点使用写连接 |
| CMS  | `apps/cms` |   `3100` | `https://cms.fwqgo.com` | 使用具备增删改查权限的写连接               |

两个应用位于同一仓库，共享 `src/features`、`packages/db`、`packages/core` 和 UI 基础组件，但拥有独立入口、构建产物和 PM2 进程。

CMS 路由直接从根路径开始，例如 `/ai-rewrite/tasks`、`/posts/edit` 和 `/images/list`。项目不再使用 `/end` 前缀。

## 主要能力

### 公开站

- 中文主站和 `/en` 英文路由树，文章、分类和标签使用独立语言字段。
- 文章详情、分类聚合、标签聚合、搜索和首页推荐。
- 服务器套餐库及地区、线路、商家、专题等筛选页。
- Markdown 正文渲染，保留表格中的真实链接和推广链接。
- 短链跳转、返利链接、相关文章与套餐内链。
- canonical、hreflang、sitemap、robots 和站点/分类/标签 SEO 配置。
- Next.js Image、响应式图片和公开页面缓存。

### CMS

- AI 内容生产台、统一任务中心、任务步骤、失败原因、重试、取消和人工处理。
- 网页抓取与正文清洗，按 Markdown 管线生成中文草稿和英文 SEO 草稿。
- Markdown 文章编辑、草稿箱、文章列表、发布质检和中英文分类/标签。
- 返利商家、链接命中诊断、短链跳转和首页推荐管理。
- 服务器套餐提取、去重、审核、人工修正和状态管理。
- 图片上传、WebP 处理、图片资产、引用关系、AI 生图和批量封面生成。
- 中文/英文主页 SEO、分类 SEO 和标签 SEO。
- DeepSeek、OpenAI 及第三方 OpenAI 兼容改写接口；OpenAI Images、Image2 及兼容生图接口。

### AI 内容管线

文章生产的主流程为：

1. 抓取 HTML。
2. 清洗为内部文章文档，移除样式、广告和无关模块。
3. 压缩为 Markdown 输入，同时保留链接、表格和关键套餐信息。
4. 改写中文正文。
5. 单独生成中文标题、摘要、关键词和 slug。
6. 成功后保存中文草稿。
7. 使用改写后的中文 Markdown 生成英文正文。
8. 单独生成英文 SEO 字段并保存为关联的英文草稿。

正文改写与 SEO 生成使用独立步骤和风格配置。后台任务会记录输入、输出、进度和可读错误，避免单个失败任务阻塞整个队列。

## 本地开发

### 环境要求

- Node.js 24（CI 与生产版本；最低建议 Node.js 20.9）
- npm
- PostgreSQL 14+
- macOS 或 Linux；涉及网页抓取时需满足 Puppeteer 的运行依赖

### 安装

```bash
git clone git@github.com:tye-js/fwqgo.git
cd fwqgo
npm ci
```

仓库不提供包含连接信息的 `.env.example`。请在本地创建用户自有的 `.env.development`，不要提交真实凭据：

```env
# 迁移和通用回退连接；本地开发应指向开发数据库
DATABASE_URL=postgresql://app_user:password@127.0.0.1:5432/fwqgo

# 推荐：CMS 显式使用写角色
CMS_DATABASE_URL=postgresql://cms_user:password@127.0.0.1:5432/fwqgo

# 推荐：公开内容查询使用只读角色
READ_DATABASE_URL=postgresql://read_user:password@127.0.0.1:5432/fwqgo

NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_CMS_URL=http://localhost:3100

# 可选：CMS 外层 Basic Auth
CMS_BASIC_AUTH_USERNAME=local-admin
CMS_BASIC_AUTH_PASSWORD=change-this-password

# 默认关闭；仅在确实需要公开注册时开启
ENABLE_PUBLIC_SIGNUP=false
```

也可以只提供基础 `DATABASE_URL`，再使用 `CMS_USERNAME` / `CMS_PASSWORD` 和 `READ_USERNAME` / `READ_PASSWORD` 替换其中的数据库用户名与密码。完整的 `CMS_DATABASE_URL` 和 `READ_DATABASE_URL` 优先级更高。

数据库连接解析顺序：

- 写连接：`CMS_DATABASE_URL` → `DATABASE_URL` 加 CMS 凭据 → `DATABASE_URL`。
- 读连接：`READ_DATABASE_URL` → `DATABASE_URL` 加只读凭据 → 写连接。

AI 改写和生图的 Base URL、模型与 API Key 在 CMS 的“系统设置”中维护，不需要写入项目级 AI 环境变量。

### 启动应用

分别在两个终端运行：

```bash
npm run dev:web
npm run dev:cms
```

- Web：<http://localhost:3000>
- CMS：<http://localhost:3100>

## 仓库结构

```text
apps/
├── web/                       # 公开站 Next.js 应用
└── cms/                       # CMS Next.js 应用
src/
├── features/
│   ├── public/                # 公开路由、组件、查询和 action
│   ├── cms/                   # CMS 路由、组件、查询和管理 action
│   └── shared/                # 双应用共享的路由与组件
├── components/                # shadcn/Radix 与跨功能组件
├── server/
│   ├── auth/                  # 管理员会话与权限
│   ├── cache/                 # 缓存标签与 revalidation
│   ├── images/                # 图片资产和处理
│   ├── links/                 # 返利与短链
│   ├── offers/                # 服务器套餐
│   └── scrape/                # 抓取与清洗
├── lib/                       # 共享工具
└── styles/                    # 全局样式
packages/
├── ai/                        # AI 配置、生成器、任务执行器
├── auth/                      # 共享认证能力
├── cache/                     # 共享缓存能力
├── core/                      # 内容、URL 和通用核心能力
├── db/                        # Drizzle schema、读写连接和数据库 helper
└── scrape/                    # 可复用抓取能力
drizzle/                       # 版本化数据库迁移
scripts/                       # 迁移、健康检查、回填和部署工具
public/                        # 静态资源
```

## CMS 功能入口

| 一级菜单   | 子功能                                |
| ---------- | ------------------------------------- |
| 数据面板   | 内容、任务、草稿、流量和运行状态概览  |
| 内容生产   | AI 生产台、AI 任务中心、草稿箱        |
| 文章管理   | 文章列表、发布质检                    |
| 媒体中心   | 图片资产、上传图片、AI 生图、封面生图 |
| 服务器套餐 | 套餐提取结果审核与人工修正            |
| SEO 运营   | 主页 SEO、分类 SEO、标签 SEO          |
| 推广链接   | 返利商家、短链跳转、首页推荐          |
| 系统设置   | AI 改写配置、生图接口配置             |

所有 CMS 管理 mutation 都应先通过服务端管理员会话校验，并为操作者返回可读错误。

## 数据库与迁移

Schema 源文件是 `packages/db/schema.ts`，迁移文件位于 `drizzle/`。

主要数据域：

- 内容：`posts`、`categories`、`tags`、`post_tags`、文章中英文关联。
- 认证：`users`、`accounts`、`sessions`、验证令牌。
- AI：改写配置、来源素材、改写任务、任务步骤、来源站和后台作业。
- 媒体：`image_assets`、图片引用、生图配置和封面生成任务。
- 运营：返利商家、短链、首页推荐、站点 SEO。
- 套餐：`server_offers`、套餐导入任务及来源文章关联。

常用命令：

```bash
npm run db:generate       # schema 变更后生成迁移
npm run db:migrate        # 本地执行版本化迁移
npm run db:migrate:prod   # 使用生产迁移脚本
npm run db:studio         # 打开 Drizzle Studio
npm run db:seed           # 写入开发种子数据
```

不要在生产环境直接使用 `db:push`。对已有数据库执行迁移前，必须同时检查实际表结构和 Drizzle 迁移记录；如果表或字段已经存在但缺少迁移基线，应先修复基线。

## 常用命令

| 命令                       | 用途                         |
| -------------------------- | ---------------------------- |
| `npm run dev:web`          | 启动 Web 开发服务，端口 3000 |
| `npm run dev:cms`          | 启动 CMS 开发服务，端口 3100 |
| `npm run build:web`        | 构建 Web                     |
| `npm run build:cms`        | 构建 CMS                     |
| `npm run build`            | 依次构建双应用并检查应用边界 |
| `npm run start:web`        | 启动 Web 生产构建            |
| `npm run start:cms`        | 启动 CMS 生产构建            |
| `npm run verify:apps`      | 验证 Web/CMS 路由和产物边界  |
| `npm run lint`             | ESLint 检查                  |
| `npm run typecheck`        | TypeScript 类型检查          |
| `npm run check`            | 依次执行 lint 和 typecheck   |
| `npm run healthcheck:prod` | 检查生产域名、跳转和关键路由 |

历史数据维护脚本还包括：

```bash
npm run links:convert
npm run posts:backfill-md-en
npm run posts:backfill-en-taxonomy
npm run source:pull
```

运行回填脚本前应先备份数据库，并确认目标环境。

## 质量检查

提交前建议依次运行：

```bash
npm run lint
npm run typecheck
SKIP_ENV_VALIDATION=1 npm run build
```

`SKIP_ENV_VALIDATION=1` 只用于本地缺少真实环境变量时验证构建。生产构建必须提供完整环境变量。

## 部署

默认部署方式是 GitHub Actions。用户手动提交并推送到 `main` 后，`.github/workflows/deploy.yml` 会构建并发布。普通的“部署”请求只表示准备并验证发布，不授权自动提交、推送或执行本地部署脚本。

发布流程：

1. 使用 Node.js 24 安装依赖、执行 typecheck 和 lint。
2. 构建 Web/CMS standalone 产物并验证应用边界。
3. 上传 release，保留共享生产环境文件和 `/var/www/uploads`。
4. 可选执行数据库备份与 Drizzle 迁移。
5. 切换 `current` 软链接并重启 `fwqgo-web`、`fwqgo-cms`。
6. 检查本地端口、公开域名、CMS 登录跳转和 PM2 状态。
7. 激活失败时尝试回滚到上一份有效 release。

### 服务器前置条件

- Node.js 24、PM2、Nginx。
- PostgreSQL 连接；执行迁移的 `DATABASE_URL` 需要迁移权限。
- Nginx 将公开站转发到 `127.0.0.1:3000`，CMS 转发到 `127.0.0.1:3100`。
- `/var/www/fwqgo/shared/.env.production` 保存运行时环境变量。
- `/var/www/uploads` 持久化用户图片，并由 Nginx 暴露为 `/uploads/`。
- 建议安装 `pg_dump`，以便迁移前自动备份。

GitHub Actions Secrets：

```text
DEPLOY_HOST
DEPLOY_USER
SSH_PRIVATE_KEY
DATABASE_URL
READ_DATABASE_URL
CMS_BASIC_AUTH_USERNAME
CMS_BASIC_AUTH_PASSWORD
```

按数据库角色方案可额外配置：

```text
CMS_DATABASE_URL
CMS_USERNAME
CMS_PASSWORD
READ_USERNAME
READ_PASSWORD
```

GitHub Actions Variables：

```text
DEPLOY_PORT=22
DEPLOY_PATH=/var/www/fwqgo
KEEP_RELEASES=5
REMOTE_UPLOAD_DIR=/var/www/uploads
NEXT_PUBLIC_URL=https://fwqgo.com
NEXT_PUBLIC_CMS_URL=https://cms.fwqgo.com
```

Actions Secrets 用于 CI 构建和连接校验，不会替代服务器上的共享 `.env.production`。两处配置应保持一致，但都不能提交到仓库。

### 本地应急部署

`scripts/deploy-local-build.sh` 仅作为明确要求时使用的应急方案：

```bash
npm run deploy:local
```

常规发布不要运行该命令。

## 安全约束

- 不提交 `.env*`、数据库 URL、API Key、SSH 私钥或 Basic Auth 凭据。
- CMS 同时使用外层 Basic Auth 和服务端管理员会话；管理 action 必须校验会话。
- 公开注册默认关闭，只有 `ENABLE_PUBLIC_SIGNUP=true` 时开放。
- Web 使用只读数据库角色处理公开查询；迁移、CMS mutation 和埋点使用最小必要写权限。
- API 与 Server Action 不向客户端返回数据库连接、堆栈或原始服务端异常。
- 生产迁移前备份数据库，图片目录单独持久化和备份。

## License

本项目使用 [MIT License](LICENSE)。
