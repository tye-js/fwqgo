# PR 独立质量门禁规格

- Issue: [#3](https://github.com/tye-js/fwqgo/issues/3)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

当前仓库只有生产部署工作流 `.github/workflows/deploy.yml`。质量检查、双应用构建与部署处于同一条 `push -> main` 链路，导致 PR 在合并前没有仓库级自动验证。

这会把可在评审阶段发现的问题推迟到生产部署阶段，并且无法为 Issue -> Spec PR -> Implementation PR 的优化流程提供稳定门禁。

## 2. 优化目标

新增独立的 PR CI，在代码合并到 `main` 前验证：

1. ESLint。
2. TypeScript。
3. 单元测试。
4. 部署、迁移、安全、缓存和应用边界验证器。
5. Web 与 CMS 的完整生产构建。

CI 只负责验证，不执行迁移、上传、SSH、PM2、缓存刷新或生产部署。

## 3. 设计约束

### 3.1 触发条件

- 目标分支必须是 `main`。
- 处理 `opened`、`synchronize`、`reopened` 和 `ready_for_review`。
- 草稿 PR 不运行重型验证；转为 ready 后自动运行。
- 支持 `workflow_dispatch`，便于维护者手动复验。

### 3.2 权限与数据边界

- GitHub token 权限固定为 `contents: read`。
- 不读取仓库生产 Secrets。
- 不设置生产数据库 URL。
- 本地验证构建使用 `SKIP_ENV_VALIDATION=1`。
- 测试数据库连接由现有 `npm test` 脚本提供，不连接生产数据库。

### 3.3 并发策略

- 并发键按 workflow 与 PR/引用隔离。
- 同一 PR 的旧运行在新提交到达时取消。
- 不影响其他 PR 或生产部署工作流。

### 3.4 运行环境

- `ubuntu-24.04`。
- Node.js 24。
- 使用 npm cache。
- 依赖安装命令为 `npm ci --include=optional`，确保 Sharp 等可选依赖与生产构建一致。

## 4. 实施计划

1. 新增 `.github/workflows/ci.yml`。
2. 配置最小权限、PR 事件和并发取消。
3. 安装依赖。
4. 执行 `npm run check`。
5. 执行 `SKIP_ENV_VALIDATION=1 npm run build`。
6. 审查 workflow，确认没有生产副作用。
7. 在 Implementation PR 中观察该工作流首次运行结果。

## 5. 验收标准

- [ ] 指向 `main` 的非草稿 PR 自动触发 CI。
- [ ] 草稿 PR 不执行重型验证，ready 后自动执行。
- [ ] 同一 PR 新提交会取消旧运行。
- [ ] workflow 权限只有 `contents: read`。
- [ ] workflow 不引用 `secrets.*`。
- [ ] workflow 不包含数据库迁移、SSH、上传、PM2 或部署命令。
- [ ] 使用 Node.js 24 与 npm cache。
- [ ] 执行 `npm ci --include=optional`。
- [ ] 执行 `npm run check`。
- [ ] 执行 `SKIP_ENV_VALIDATION=1 npm run build`。
- [ ] 本地 `npm run lint` 通过。
- [ ] 本地 `npm run typecheck` 通过。
- [ ] 本地 `npm test` 通过。
- [ ] 本地 `SKIP_ENV_VALIDATION=1 npm run build` 通过。

## 6. 风险与回退

### 风险

- 完整双应用构建增加 Actions 时间。
- 同时保留 `npm run check` 与完整构建会重复执行部分 TypeScript 校验。

### 控制

- npm cache 降低安装成本。
- 草稿跳过和并发取消减少无效运行。
- 优先保证合并前发现生产构建问题，不以减少数分钟 CI 时间换取验证盲区。

### 回退

该改动只新增独立 workflow。若出现异常，可禁用或删除 `.github/workflows/ci.yml`，不会影响现有生产部署工作流和应用运行时。
