# 匿名认证请求资源边界规格

- Issue: [#15](https://github.com/tye-js/fwqgo/issues/15)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

CMS 登录与可选注册 API 可在未登录状态访问。当前路由直接调用 `request.json()`，字段校验发生在完整请求体进入内存并解析之后。登录字段缺少最大长度，注册确认密码也缺少最大长度。

速率限制不能替代单请求资源边界：登录必须先解析用户名才能计算组合限速键；注册即使先按 IP 限速，单次超大请求仍会被 JSON parser 读取。

## 2. 目标

为两个认证入口建立双层边界：

1. 请求体最多 8 KiB。
2. 登录用户名最多 20 字符、密码最多 100 字符。
3. 注册确认密码最多 100 字符。

超限请求在数据库查询、bcrypt 和 Session 创建前返回 HTTP 413。

## 3. Bounded body helper

新增 `packages/core/bounded-request-body.ts`，提供：

- `RequestBodyTooLargeError`：明确区分 413 与无效 JSON。
- `readRequestTextWithLimit(request, maxBytes)`：
  - 将配置值规范为至少 1 字节。
  - 若有效 `Content-Length` 大于上限，读取 body 前抛错。
  - 无长度或 chunked 请求按每个 `Uint8Array.byteLength` 累计。
  - 实际字节数超过上限时取消 reader 并抛错。
  - 正确释放 reader lock。
  - 以 UTF-8 流式解码，边界按字节而非字符计算。

helper 不依赖 Next.js、数据库或认证模块。

## 4. 路由行为

### 登录

- 使用 8 KiB helper 后再执行 `JSON.parse` 与 Zod。
- body 超限：413，可读的“请求内容过大”反馈。
- JSON 无效或字段不合法：400，保持模糊认证反馈。
- 用户名 3-20 字符，密码 6-100 字符。
- 限速、bcrypt 假哈希、Session 和 Cookie 行为不变。

### 注册

- `ENABLE_PUBLIC_SIGNUP !== true` 时仍立即返回 403，不读取 body。
- 开启注册后，保留现有 IP 限速顺序。
- 使用同一 8 KiB helper。
- body 超限返回 413。
- `confirmPassword` 最大 100 字符。
- 其他注册规则和哈希行为不变。

## 5. 测试

纯函数测试覆盖：

- 恰好达到限制的 ASCII body。
- UTF-8 多字节内容按字节计算。
- Content-Length 超限。
- 无 Content-Length 的实际流超限。
- 空 body。
- 错误类型和 maxBytes 数据。

## 6. 验收标准

- [ ] 两个认证路由不再调用 `request.json()`
- [ ] 8 KiB 内请求正常进入 JSON/Zod
- [ ] 声明长度和实际流长度都受限
- [ ] 413 在 DB/bcrypt 前返回
- [ ] 无效 JSON 仍为 400
- [ ] 登录长度与注册规则一致
- [ ] 注册关闭行为不变
- [ ] 新 helper 有单元测试
- [ ] `bun run verify:security` 通过
- [ ] `bun run lint` 通过
- [ ] `bun run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 bun run build` 通过

## 7. 风险与回退

合法认证 payload 通常不足 1 KiB，8 KiB 不影响正常表单。非标准客户端携带大量无用字段会被拒绝，这是预期边界。回退只涉及请求解析，不涉及账户、密码或 Session 数据。
