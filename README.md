# FWQGO（服务器go）

FWQGO 是一个面向服务器、VPS 和云产品优惠内容的双应用平台。公开站负责中文/英文内容、服务器套餐专题和 SEO，独立 CMS 负责采集、AI 改写、文章审核、媒体资产、返利链接与运营配置。

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-149ECA?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3.14-f9f1e1?style=flat-square&logo=bun)](https://bun.sh/)
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
- `/servers` 库存工具使用 URL 筛选、服务端查询和 30 条游标分页；地区、线路、商家与专题页负责 SEO 承接。
- Markdown 正文渲染，保留表格中的真实链接和推广链接。
- 短链跳转、返利链接、相关文章与套餐内链。
- canonical、hreflang、sitemap、robots 和站点/分类/标签 SEO 配置。
- Next.js Image、响应式图片和公开页面缓存。

### CMS

- AI 内容生产台、统一任务中心、任务步骤、失败原因、重试、取消和人工处理。
- 网页抓取与正文清洗，按 Markdown 管线生成中文草稿和英文 SEO 草稿。
- Markdown 文章编辑、草稿箱、文章列表、发布质检和中英文分类/标签。
- 返利商家、链接命中诊断、短链跳转和首页文章/套餐/推广图片运营位。
- 服务器套餐提取、去重、多周期价格、人工锁定字段、库存监控、检测历史和状态管理。
- 图片上传、WebP 处理、图片资产、引用关系、AI 生图和批量封面生成。
- 中文/英文主页 SEO、分类 SEO 和标签 SEO。
- DeepSeek、OpenAI 及第三方 OpenAI 兼容改写接口；OpenAI Images、Image2 及兼容生图接口。

### AI 内容管线

正文改写与 SEO 生成使用独立步骤和风格配置。后台任务会记录输入、输出、进度和可读错误，避免单个失败任务阻塞整个队列。

## 本地开发

### 环境要求

- Bun 1.3.14（本地开发、构建和生产 standalone 应用运行时）
- Node.js 24（PM2、迁移脚本和旧 release 回滚兼容；最低建议 Node.js 20.9）
- PostgreSQL 14+
- macOS 或 Linux；涉及网页抓取时需满足 Puppeteer 的运行依赖

### 安装

```bash
git clone git@github.com:tye-js/fwqgo.git
cd fwqgo
bun install --frozen-lockfile
```

仓库不提供包含连接信息的 `.env.example`。请在本地创建用户自有的 `.env.development`，不要提交真实凭据：

```env
# 迁移和通用回退连接；本地开发应指向开发数据库
DATABASE_URL=postgresql://app_user:password@127.0.0.1:5432/fwqgo

# 推荐：CMS 显式使用写角色
CMS_DATABASE_URL=postgresql://cms_user:password@127.0.0.1:5432/fwqgo

# 推荐：公开内容查询使用只读角色
READ_DATABASE_URL=postgresql://read_user:password@127.0.0.1:5432/fwqgo

# 浏览量埋点使用的独立写连接；生产环境建议使用只允许更新浏览量的最小权限角色
ANALYTICS_DATABASE_URL=postgresql://analytics_user:password@127.0.0.1:5432/fwqgo

# 可选：CMS 通知 Web 精准刷新缓存，两个进程必须使用同一个随机密钥
# GitHub Actions 部署未配置时会自动生成并写入服务器共享运行环境
WEB_REVALIDATION_SECRET=replace-with-at-least-16-random-characters
WEB_REVALIDATION_URL=http://127.0.0.1:3000/api/internal/revalidate

NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_CMS_URL=http://localhost:3100

# 可选：CMS 外层 Basic Auth
CMS_BASIC_AUTH_USERNAME=local-admin
CMS_BASIC_AUTH_PASSWORD=change-this-password

# 默认关闭；仅在确实需要公开注册时开启
ENABLE_PUBLIC_SIGNUP=false

# 可选：通用后台调度记录保留天数，默认 14，范围 1-365
ADMIN_BACKGROUND_JOB_RETENTION_DAYS=14
```

也可以只提供基础 `DATABASE_URL`，再使用 `CMS_USERNAME` / `CMS_PASSWORD` 和 `READ_USERNAME` / `READ_PASSWORD` 替换其中的数据库用户名与密码。完整的 `CMS_DATABASE_URL` 和 `READ_DATABASE_URL` 优先级更高。

数据库连接解析顺序：

- 写连接：`CMS_DATABASE_URL` → `DATABASE_URL` 加 CMS 凭据 → `DATABASE_URL`。
- 读连接：`READ_DATABASE_URL` → `DATABASE_URL` 加只读凭据 → 写连接。
- 埋点连接：`ANALYTICS_DATABASE_URL` → 写连接；生产环境应显式配置。

AI 改写和生图的 Base URL、模型与 API Key 在 CMS 的“系统设置”中维护，不需要写入项目级 AI 环境变量。

### 启动应用

分别在两个终端运行：

```bash
bun run dev:web
bun run dev:cms
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
bun run db:generate       # schema 变更后生成迁移
bun run db:migrate        # 本地执行版本化迁移
bun run db:migrate:prod   # 使用生产迁移脚本
bun run db:studio         # 打开 Drizzle Studio
bun run db:seed           # 写入开发种子数据
```

不要在生产环境直接使用 `db:push`。对已有数据库执行迁移前，必须同时检查实际表结构和 Drizzle 迁移记录；如果表或字段已经存在但缺少迁移基线，应先修复基线。

## 常用命令

| 命令                        | 用途                           |
| --------------------------- | ------------------------------ |
| `bun run dev:web`           | 启动 Web 开发服务，端口 3000   |
| `bun run dev:cms`           | 启动 CMS 开发服务，端口 3100   |
| `bun run build:web`         | 构建 Web                       |
| `bun run build:cms`         | 构建 CMS                       |
| `bun run build`             | 依次构建双应用并检查应用边界   |
| `bun run start:web`         | 启动 Web 生产构建              |
| `bun run start:cms`         | 启动 CMS 生产构建              |
| `bun run test`              | 运行核心业务回归测试           |
| `bun run verify:apps`       | 验证 Web/CMS 路由和产物边界    |
| `bun run verify:deploy`     | 验证 Actions 远端激活脚本      |
| `bun run verify:migrations` | 验证迁移 journal 与 SQL 文件   |
| `bun run verify:security`   | 验证 CMS 鉴权和数据库边界      |
| `bun run verify:cache`      | 验证公开站关键读取缓存边界     |
| `bun run lint`              | ESLint 检查                    |
| `bun run typecheck`         | TypeScript 类型检查            |
| `bun run check`             | 执行静态、测试、部署和迁移校验 |
| `bun run healthcheck:prod`  | 检查生产域名、跳转和关键路由   |

历史数据维护脚本还包括：

```bash
bun run links:convert
bun run posts:backfill-md-en
bun run posts:backfill-en-taxonomy
bun run source:pull
```

运行回填脚本前应先备份数据库，并确认目标环境。

## 质量检查

提交前建议依次运行：

```bash
bun run lint
bun run typecheck
bun run test
SKIP_ENV_VALIDATION=1 bun run build
```

`SKIP_ENV_VALIDATION=1` 只用于本地缺少真实环境变量时验证构建。生产构建必须提供完整环境变量。

## 部署

默认部署方式是 GitHub Actions。用户手动提交并推送到 `main` 后，`.github/workflows/deploy.yml` 会构建并发布。普通的“部署”请求只表示准备并验证发布，不授权自动提交、推送或执行本地部署脚本。

发布流程：

1. 使用 Bun 1.3.14 安装依赖，执行 typecheck、lint、部署脚本和迁移完整性校验。
2. 构建 Web/CMS standalone 产物并验证应用边界。
3. 上传 release，保留共享生产环境文件和 `/var/www/uploads`，并安全合并缓存刷新与埋点连接配置。
4. 可选执行数据库备份与 Drizzle 迁移。
5. 切换 `current` 软链接并使用 release 内置 Bun 重启 `fwqgo-web`、`fwqgo-cms`，随后校验 PM2 的解释器和执行模式确实为 Bun `fork`。
6. 通过 `/api/health` 验证 Web 只读角色和 CMS 写角色权限，再检查公开域名、CMS 登录跳转和 PM2 状态。
7. 激活失败时尝试回滚到上一份有效 release。

### 服务器前置条件

- Node.js 24、PM2、Nginx；新 release 自带 Bun 1.3.14，旧 release 回滚使用 Node.js。
- PostgreSQL 连接；执行迁移的 `DATABASE_URL` 需要迁移权限。
- Nginx 将公开站转发到 `127.0.0.1:3000`，CMS 转发到 `127.0.0.1:3100`。
- `/var/www/fwqgo/shared/.env.production` 保存运行时环境变量。
- `/var/www/uploads` 持久化用户图片，并由 Nginx 暴露为 `/uploads/`。
- 建议安装 `pg_dump`，以便迁移前自动备份。
- 建议为迁移角色启用 PostgreSQL `pg_trgm` 扩展；无法启用时会回退到普通文本搜索。
- Bun release 通过 PM2 `fork` 模式运行 Web/CMS 各一个实例；PM2 `cluster` 会走 Node
  cluster 主进程，因此不能用于让 Bun 成为实际 worker。`WEB_INSTANCES` / `CMS_INSTANCES`
  只对旧 Node release 的回滚路径生效，且未部署共享 Redis 前应保持 `1`。

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
ANALYTICS_DATABASE_URL
```

GitHub Actions Variables：

```text
DEPLOY_PORT=22
DEPLOY_PATH=/var/www/fwqgo
KEEP_RELEASES=5
REMOTE_UPLOAD_DIR=/var/www/uploads
NEXT_PUBLIC_URL=https://fwqgo.com
NEXT_PUBLIC_CMS_URL=https://cms.fwqgo.com
WEB_REVALIDATION_URL=http://127.0.0.1:3000/api/internal/revalidate
```

`WEB_REVALIDATION_SECRET` 可作为 GitHub Secret 固定配置；未配置时，Actions 会为本次发布生成随机密钥并进行日志掩码。Actions 会把该密钥、`WEB_REVALIDATION_URL` 和 `ANALYTICS_DATABASE_URL` 合并进服务器共享 `.env.production`，保证 Web 与 CMS 使用同一值。其他运行时配置仍由服务器文件维护。所有真实凭据都不能提交到仓库。

### 本地应急部署

`scripts/deploy-local-build.sh` 仅作为明确要求时使用的应急方案：

```bash
bun run deploy:local
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
