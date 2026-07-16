# AI 健康检查响应体上限规格

- Issue: [#18](https://github.com/tye-js/fwqgo/issues/18)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

AI 改写接口连接检测会访问后台配置的第三方公网端点。当前通过 `response.text()` 无界读取响应。健康检查预期响应很小，但不可信上游可以返回任意数据量。

项目已有 bounded response helper，可在流式读取中停止超限内容，但健康检查未接入；helper 对无效限制值和声明长度也可进一步收紧。

## 2. 目标

- 健康检查响应硬上限为 256 KiB。
- 超限时返回结构化失败结果：
  - 标题：响应内容过大。
  - 错误：说明 256 KiB 限制。
  - 建议：检查 Base URL 是否指向兼容 JSON API。
- 超限不进入 JSON 解析或 HTTP 错误正文分类。
- 正常响应与现有状态分类完全不变。

## 3. Helper 契约

`readResponseBodyWithLimit(response, maxBytes)`：

1. 非有限或小于 1 的限制收敛为 1。
2. 有效 `Content-Length` 大于限制时取消 body 并返回 `null`。
3. 声明长度缺失、无效或伪小值时，实际读取仍按 `byteLength` 限制。
4. 超限时取消 reader。
5. 所有路径释放 reader lock。
6. 正常内容返回完整 `Uint8Array`。

`readResponseTextWithLimit` 保持以 UTF-8 解码或返回 `null`。

## 4. 实施计划

1. 强化 bounded response helper。
2. 增加 Content-Length 和无效 limit 测试。
3. 健康检查引入 helper 和 256 KiB 常量。
4. 在解析前处理 `null` 超限结果。
5. 执行完整验证。

## 5. 验收标准

- [ ] 健康检查不调用 `response.text()`
- [ ] 正常小响应行为不变
- [ ] 超限响应返回可读失败结果
- [ ] Content-Length 与实际流都受限
- [ ] 无效 limit 保持硬边界
- [ ] helper 测试覆盖新增分支
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 6. 风险与回退

256 KiB 远高于标准 chat completion 健康检查响应。超限只影响错误网关。回退仅恢复读取方式，无数据迁移。
