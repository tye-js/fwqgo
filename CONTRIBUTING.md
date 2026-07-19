# 贡献指南

感谢您对服务器go项目的关注！我们欢迎所有形式的贡献。

## 🚀 快速开始

1. Fork 本仓库
2. 克隆您的 fork: `git clone https://github.com/your-username/fwqgo.git`
3. 安装 Bun 1.3.14，并执行: `bun install --frozen-lockfile`
4. 创建分支: `git checkout -b feature/your-feature-name`
5. 进行更改并测试
6. 提交更改: `git commit -m 'feat: add some feature'`
7. 推送到您的 fork: `git push origin feature/your-feature-name`
8. 创建 Pull Request

## 📝 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 提交类型

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 代码重构
- `test`: 添加或修改测试
- `chore`: 构建过程或辅助工具的变动

### 示例

```
feat: 添加文章搜索功能
fix: 修复分页组件显示问题
docs: 更新API文档
style: 统一代码格式
refactor: 重构用户认证逻辑
test: 添加文章创建测试用例
chore: 更新依赖版本
```

## 🧪 测试

在提交之前，请确保：

```bash
# 代码格式检查
bun run lint

# 类型检查
bun run typecheck

# 核心测试与部署契约检查
bun run test
bun run verify:deploy
```

## 🐛 报告问题

如果您发现了bug，请：

1. 检查是否已有相关issue
2. 创建新issue，包含：
   - 问题描述
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（浏览器、Node.js版本等）

## 💡 功能建议

我们欢迎功能建议！请：

1. 检查是否已有相关讨论
2. 创建issue描述您的想法
3. 说明功能的用途和价值

## 📋 开发规范

### 代码风格

- 使用 TypeScript
- 遵循 ESLint 和 Prettier 配置
- 使用有意义的变量和函数名
- 添加必要的注释

### 组件开发

- 使用 shadcn/ui 组件库
- 保持组件的单一职责
- 添加 TypeScript 类型定义
- 考虑组件的可复用性

### 数据库变更

- 使用 Drizzle ORM
- 创建迁移文件
- 更新相关类型定义
- 测试数据库变更

## 🤝 行为准则

请遵循以下准则：

- 尊重所有参与者
- 使用友善和包容的语言
- 接受建设性的批评
- 专注于对社区最有利的事情

## 📞 联系我们

如有疑问，请通过以下方式联系：

- GitHub Issues
- 邮箱: contact@fwqgo.com

感谢您的贡献！🎉
