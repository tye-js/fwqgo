# 🚀 服务器go

> 专业的服务器优惠信息聚合平台，为用户提供最全面、最新的VPS、云服务器、独立服务器等优惠信息

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.3-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)

## ✨ 项目特色

- 🎯 **专业聚合** - 汇总国内外优质服务器优惠信息
- 🤖 **智能采集** - 自动化内容采集与AI优化
- 💰 **返利管理** - 智能返利链接替换系统
- 📱 **响应式设计** - 完美适配移动端和桌面端
- ⚡ **极速体验** - Turbopack构建，毫秒级热更新
- 🔍 **SEO优化** - 完整的SEO策略和动态sitemap

## 🏗️ 技术架构

### 前端技术栈
- **框架**: Next.js 16 App Router，`apps/web` 和 `apps/cms` 双应用
- **UI库**: React 19 + Radix UI + shadcn/ui
- **样式**: Tailwind CSS + CSS Variables
- **状态管理**: React Hook Form + Zod
- **构建工具**: Turbopack (默认) + Webpack (备用)

### 后端技术栈
- **数据库**: PostgreSQL + Drizzle ORM
- **认证**: 自定义Session认证系统
- **爬虫**: Puppeteer + Cheerio
- **AI**: LangChain + Google Generative AI
- **部署**: PM2 + Node.js

## 🚀 快速开始

### 环境要求

- Node.js 18.0.0+
- PostgreSQL 14.0+
- npm 或 bun

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/your-username/fwqgo.git
cd fwqgo
```

2. **安装依赖**
```bash
npm install
# 或使用 bun
bun install
```

3. **环境配置**
```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下环境变量：
```env
DATABASE_URL="postgresql://username:password@localhost:5432/fwqgo"
NEXT_PUBLIC_URL="http://localhost:3000"
```

4. **数据库设置**
```bash
# 生成数据库迁移文件
npm run db:generate

# 执行数据库迁移
npm run db:migrate

# (可选) 填充测试数据
npm run db:seed
```

5. **启动开发服务器**
```bash
npm run dev:web
npm run dev:cms
```

访问 [http://localhost:3000](http://localhost:3000) 查看前台，访问 [http://localhost:3100](http://localhost:3100) 查看 CMS。

## 📁 项目结构

```
apps/
├── web/                   # 公开前台 Next 应用，运行在 3000
└── cms/                   # CMS 后台 Next 应用，运行在 3100
src/
├── features/
│   ├── public/            # 前台 routes、components、data、actions
│   ├── cms/               # 后台 routes、components、data、actions
│   └── shared/            # 前后台共享 routes/data/components
├── components/            # shadcn/ui 和跨功能 UI 组件
├── lib/                   # 兼容工具导出
├── server/                # 服务端业务能力：auth/cache/scrape/ai/images 等
├── styles/                # 全局样式
└── types/                 # TypeScript 类型定义
packages/
├── core/                  # 可复用核心工具
└── db/                    # Drizzle schema、数据库连接和 DB helper
drizzle/                   # 数据库迁移
public/                    # 静态资产
```

## 🎯 核心功能

### 📝 内容管理系统
- **文章管理**: 创建、编辑、发布文章
- **分类管理**: 支持层级分类结构
- **标签系统**: 灵活的多标签关联
- **SEO优化**: 完整的SEO字段支持
- **富文本编辑**: 基于TipTap的现代编辑器

### 🤖 智能采集系统
- **多站点支持**: 支持多个服务器信息网站
- **内容清理**: 自动移除广告和无关内容
- **链接处理**: 智能返利链接替换
- **AI优化**: 使用LangChain进行内容重写和优化

### 💰 返利管理
- **多服务商**: 支持多个云服务商返利
- **自动替换**: 智能识别和替换返利链接
- **灵活配置**: 支持不同的返利参数格式

### 🎨 用户界面
- **现代设计**: 基于shadcn/ui的现代化界面
- **响应式**: 完美适配各种设备尺寸
- **暗色模式**: 支持明暗主题切换
- **无障碍**: 遵循WCAG无障碍标准

## 📊 数据库设计

### 核心数据表
- **posts**: 文章内容和元数据
- **categories**: 分类层级结构
- **tags**: 标签管理
- **post_tags**: 文章标签关联
- **users**: 用户管理
- **sessions**: 会话认证
- **aff_service_providers**: 返利服务商配置

### 关系设计
- 文章与分类：一对多关系
- 文章与标签：多对多关系
- 分类支持层级结构
- 完整的用户认证体系

## 🛠️ 开发指南

### 可用脚本

```bash
# 开发
npm run dev          # 启动开发服务器 (Turbopack)
npm run dev:webpack  # 启动开发服务器 (Webpack)

# 构建
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run preview      # 构建并启动预览

# 数据库
npm run db:generate  # 生成迁移文件
npm run db:migrate   # 执行迁移
npm run db:push      # 推送schema变更
npm run db:studio    # 打开Drizzle Studio
npm run db:seed      # 填充测试数据

# 代码质量
npm run lint         # 运行ESLint
npm run lint:fix     # 自动修复ESLint问题
npm run typecheck    # TypeScript类型检查
npm run format:write # 格式化代码
npm run format:check # 检查代码格式
```

### 开发规范

1. **代码风格**: 使用Prettier + ESLint
2. **提交规范**: 遵循Conventional Commits
3. **类型安全**: 严格的TypeScript配置
4. **组件规范**: 使用shadcn/ui组件库

### 环境变量

| 变量名            | 描述                 | 示例                                       |
| ----------------- | -------------------- | ------------------------------------------ |
| `DATABASE_URL`    | PostgreSQL连接字符串 | `postgresql://user:pass@localhost:5432/db` |
| `NEXT_PUBLIC_URL` | 网站公开URL          | `https://fwqgo.com`                        |
| `NEXT_PUBLIC_CMS_URL` | 后台管理公开URL      | `https://cms.fwqgo.com`                    |
| `CMS_BASIC_AUTH_USERNAME` | CMS Basic Auth 用户名 | `fwqgo-admin`                              |
| `CMS_BASIC_AUTH_PASSWORD` | CMS Basic Auth 密码   | `change-this-password`                     |
| `NODE_ENV`        | 运行环境             | `development` / `production`               |

### 前台和后台域名

当前采用同仓库双 Next 应用部署：

- `fwqgo.com` 和 `www.fwqgo.com` 代理到 `fwqgo-web`，端口 `3000`。
- `cms.fwqgo.com` 代理到 `fwqgo-cms`，端口 `3100`。
- 主站访问 `/end/*` 或 `/login` 会跳转到 CMS 域名。
- CMS 域名访问公开文章、服务器专题和短链路径会跳回主站，避免重复收录。
- CMS 域名支持 Basic Auth + 管理员登录双层保护。

PM2 使用 `ecosystem.config.cjs` 同时运行 `fwqgo-web` 和 `fwqgo-cms`。

## 🚀 部署指南

### 生产环境部署

默认使用 `.github/workflows/deploy.yml` 部署。用户手动提交并推送到 `main` 后，GitHub Actions 自动完成检查、构建、打包、上传、数据库迁移、PM2 激活和健康检查。

普通的“部署”“上线”指令不应在本机执行上传脚本，也不代表允许自动提交或推送。代码验证完成后，由用户手动 push 触发 GitHub Actions。

服务器需要先准备：

- Node.js 和 PM2
- PostgreSQL 连接信息
- Nginx 或其他反向代理，将站点流量转发到 `127.0.0.1:3000`
- `/var/www/uploads`，并在反向代理中暴露为 `/uploads/`

1. **准备服务器运行时环境**

GitHub Actions 会检查 `/var/www/fwqgo/shared/.env.production`。首次部署前需要在服务器补齐生产环境变量。

2. **验证后手动推送**

```bash
npm run lint
npm run typecheck
SKIP_ENV_VALIDATION=1 npm run build
```

验证通过后，由用户手动提交并推送到 `main`。不要由自动化代理默认执行 commit 或 push。

3. **GitHub Actions 自动部署**

工作流会执行：

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 打包 Web/CMS standalone 运行时、静态资源和 `public`
- 上传到服务器 release 目录
- 按工作流配置执行生产迁移
- 更新 `current` 软链接
- `pm2 startOrReload ecosystem.config.cjs --update-env`
- 检查 Web、CMS 和 PM2 状态

### 本地 Docker 应急部署

本地上传脚本不是默认部署方式。只有在明确要求“使用本地部署脚本”或“本地 Docker 部署”时才使用，并需先配置用户本机的 `.deploy.env`。

完整应急部署：

```bash
npm run deploy:local
```

只生成本地部署包：

```bash
npm run deploy:local -- --artifact-only
```

### GitHub Actions 部署

仓库包含 `.github/workflows/deploy.yml`，支持 push 到 `main` 自动部署，也支持在 GitHub Actions 页面手动触发。手动触发时可以选择是否先执行数据库迁移。

需要在 GitHub 仓库配置这些 Secrets：

```text
DEPLOY_HOST=103.117.136.139
DEPLOY_USER=root
SSH_PRIVATE_KEY=<private ssh key>
DATABASE_URL=<production database url>
READ_DATABASE_URL=<production read-only database url>
CMS_BASIC_AUTH_USERNAME=<cms basic auth username>
CMS_BASIC_AUTH_PASSWORD=<cms basic auth password>
GOOGLE_AI_API_KEY=<optional, only if still used>
```

可选配置这些 Variables：

```text
DEPLOY_PORT=22
DEPLOY_PATH=/var/www/fwqgo
KEEP_RELEASES=5
REMOTE_UPLOAD_DIR=/var/www/uploads
NEXT_PUBLIC_URL=https://fwqgo.com
NEXT_PUBLIC_CMS_URL=https://cms.fwqgo.com
```

## 📈 性能优化

- **Turbopack**: 极速开发构建体验
- **图片优化**: Next.js Image组件自动优化
- **字体优化**: next/font/google预加载
- **代码分割**: 自动代码分割和懒加载
- **缓存策略**: 合理的浏览器和CDN缓存
- **SEO优化**: 服务端渲染和静态生成

## 🔒 安全特性

- **输入验证**: Zod schema验证
- **SQL注入防护**: Drizzle ORM参数化查询
- **XSS防护**: React内置XSS防护
- **CSRF防护**: Next.js内置CSRF保护
- **会话管理**: 安全的会话认证系统

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
chore: 构建过程或辅助工具的变动
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Next.js](https://nextjs.org/) - React框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS框架
- [shadcn/ui](https://ui.shadcn.com/) - UI组件库
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [Radix UI](https://www.radix-ui.com/) - 无障碍UI组件

## 📞 联系方式

- 网站: [https://fwqgo.com](https://fwqgo.com)
- 邮箱: contact@fwqgo.com
- 问题反馈: [GitHub Issues](https://github.com/your-username/fwqgo/issues)

---

<div align="center">

**[⬆ 回到顶部](#-服务器go)**

Made with ❤️ by 服务器go Team

</div>
