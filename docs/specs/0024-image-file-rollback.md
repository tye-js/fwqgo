# 图片资产创建失败回滚规格

- Issue: [#24](https://github.com/tye-js/fwqgo/issues/24)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 一致性问题

图片资产创建横跨文件系统与 PostgreSQL，无法使用单一数据库事务。当前先写文件再插入记录，但没有补偿事务，因此变体或 DB 失败会留下孤儿文件。

变体使用 `Promise.all`，首个拒绝时另一个写入可能尚未完成，直接清理会与写操作竞态。

## 2. 回滚模型

新增 `withAsyncRollback(work)` 纯 helper：

- work 通过 `defer(cleanup)` 登记补偿动作。
- work 成功时不运行 cleanup。
- work 失败时按 LIFO 顺序执行所有 cleanup。
- 每个 cleanup 独立 try/catch；失败不阻断后续 cleanup。
- 最终重新抛出原始 work 错误。
- cleanup 不能把原始错误替换为自身错误。

## 3. 变体写入

- thumb 与 large 转码仍可并行。
- 两个文件写入使用 `Promise.allSettled`。
- 等待全部写入 settle。
- 若任一失败：
  - 删除本批次中成功写入的变体。
  - 抛出第一个写入错误。
- 全部成功才返回两个 public path。

## 4. 共享持久化路径

抽取 File/Buffer 两个入口共享的内部函数，负责：

1. hash 查询并直接返回已存在资产。
2. 计算名称、路径、尺寸。
3. 写主文件并登记 cleanup。
4. 创建变体并分别登记 cleanup。
5. 插入数据库并要求返回资产。
6. 成功返回时不清理。

任何第 3-5 步错误触发所有已登记文件的 best-effort 回滚。

## 5. 文件清理边界

- 只清理本次创建后登记的具体文件路径。
- ENOENT 视为已清理。
- 其他清理错误由回滚栈吞掉，保留原始错误。
- 不删除 hash 已命中资产或历史文件。

## 6. 测试

异步回滚 helper 单测：

- 成功不运行 cleanup。
- 失败按 LIFO 清理。
- cleanup 自身失败不阻断其他清理。
- 最终错误严格等于原始 work 错误。

## 7. 验收标准

- [ ] File/Buffer 创建复用共享持久化函数
- [ ] 变体使用 allSettled 避免写入竞态
- [ ] 变体部分失败清理成功文件
- [ ] DB 失败清理主图与变体
- [ ] 无返回行显式失败
- [ ] hash 命中不写文件
- [ ] 回滚 helper 测试通过
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 8. 风险与回退

补偿动作只作用于本次生成的唯一文件路径。若出现异常，可恢复旧持久化流程；无 schema 或数据迁移。
