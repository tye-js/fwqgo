# CMS Server Actions 请求体上限规格

- Issue: [#21](https://github.com/tye-js/fwqgo/issues/21)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

AI 文件导入通过 Server Action 提交 FormData。业务层允许文件最大 2 MiB，但 Next 16 在未配置时默认将 Server Actions body 限制为 1 MiB。合法的 1-2 MiB 文件会在业务函数执行前失败。

## 2. 目标与边界

- CMS `experimental.serverActions.bodySizeLimit`：`"3mb"`。
- AI 来源文件业务限制：继续为 `2 * 1024 * 1024` 字节。
- 约 1 MiB 差额用于 multipart 边界、文件名、MIME、分类、标题和其他字段。
- Web Next 配置保持原样，不启用该放宽。
- Route Handler 图片上传不受本配置影响。

## 3. 实施计划

1. 修改 `apps/cms/next.config.js` 的现有 `experimental` 块。
2. 添加静态回归测试，读取 CMS/Web 配置与 AI action 源码，验证三个不变量：
   - CMS 为 3mb。
   - Web 没有 Server Actions 放宽。
   - 文件业务限制仍为 2 MiB。
3. 通过 Next 构建验证配置 schema 和实际打包兼容性。

## 4. 验收标准

- [ ] CMS Server Actions 上限为 3mb
- [ ] AI 文件上限仍为 2 MiB
- [ ] Web 配置未放宽
- [ ] 业务错误文案仍为“单个文件不能超过 2MB”
- [ ] 配置回归测试通过
- [ ] `bun run lint` 通过
- [ ] `bun run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 bun run build` 通过

## 5. 风险与回退

上限只增加到满足现有业务契约所需的最小安全余量，不改变业务允许文件大小。若框架行为异常，可删除该配置项回退，无数据迁移。
