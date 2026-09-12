# Bun 构建退出崩溃修复

## 原因

GitHub Actions [34684052371](https://github.com/tye-js/fwqgo/actions/runs/34684052371) 使用 Bun 1.3.14 和 Next.js 16.3.5。编译、TypeScript 和 151 个页面的预渲染均已完成，输出路由表后，Bun 在退出清理阶段崩溃，构建返回 132 / SIGILL，后续打包和上传步骤没有执行。

[崩溃报告](https://bun.report/1.3.14/ln10d9b296i3FqkggC4j+hvE+ypRs2w/qDA2AA) 定位到 `napi.ThreadSafeFunction.release` / `napi_release_threadsafe_function`。Turbopack 的原生线程可能比创建它的 JavaScript worker 存活得更久，Bun 1.3.14 随后释放线程安全函数时会访问已经销毁的 worker 环境。

Bun 的 [#36866](https://github.com/oven-sh/bun/issues/36866) 和 [#37031](https://github.com/oven-sh/bun/issues/37031) 记录了相同问题。修复 [#34067](https://github.com/oven-sh/bun/pull/34067) 随 1.4.0 发布，当前稳定版 [1.4.2](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2) 包含该修复；其提交历史包含修复提交 `73b6c14c845817fad7a327ce96a8698881032da1`。

日志中的 `Args: "node"` 来自 Bun 的 Node shebang 兼容入口；实际运行时由同一日志中的 `Bun v1.3.14` 标明。

## 修改

- `package.json` 的 `packageManager` 固定为 `bun@1.4.2`，`@types/bun` 同步，锁文件使用该版本生成。
- 所有 Actions 通过 `bun-version-file: package.json` 读取同一版本，安装依赖前执行 `verify:bun`。
- 本地构建和发布构建也检查实际运行时版本，旧 Bun 会在构建前给出明确错误。发布构建使用 `process.execPath` 启动子构建，避免 PATH 指向另一个 Bun。
- 备用 Docker 构建镜像与项目版本一致，部署校验同时检查 workflow、类型包及镜像版本。
- 保留 Next.js 16.3.5、Turbopack、生产环境校验、只读构建数据库和正常的失败退出处理。SIGILL 仍然是构建失败，不能把已写入的部分产物当作可发布版本。

## 验证

本地应先安装 `packageManager` 指定的 Bun 版本，再运行：

```sh
bun run verify:bun
bun install --frozen-lockfile
bun run check
SKIP_ENV_VALIDATION=1 bun run build
```

`SKIP_ENV_VALIDATION=1` 仅适用于本地验证产物。正式发布继续由 Actions 使用完整生产配置和只读数据库构建，构建失败时不得上传或激活产物。实际 Linux Actions 结果需要在提交并推送本次修复后确认。

2026-09-12 在 macOS arm64 上使用经过完整性校验的官方 Bun 1.4.2 二进制完成以下验证：

| 检查 | 结果 |
| --- | --- |
| `verify:bun` | 1.4.2 通过；1.3.14 在构建前明确失败 |
| `bun install --frozen-lockfile` | 通过，仅更新 `@types/bun` 和 `bun-types` |
| `bun run check` | lint、typecheck、全部测试及项目校验通过；依赖审计未发现漏洞 |
| `SKIP_ENV_VALIDATION=1 bun run build` | Web/CMS 均完成，整体退出码 0；原生依赖准备和路由边界校验通过 |
| `bun run smoke:built` | 静态资源按 CI 方式复制后通过；覆盖 sharp WebP、RE2、健康接口、图标、跳转、鉴权、路由隔离及文章缓存边界 |
| `bash -n scripts/deploy-local-build.sh`、`git diff --check` | 通过 |

构建与 smoke 使用本地验证配置，没有连接生产数据库。未设置 `SMOKE_DATABASE_URL`，首页只验证 ISR manifest；真实首页内容及依赖真实数据库的私有请求检查未执行。本机全局 Bun 未修改，验证使用独立安装的 1.4.2。Linux 构建及本次改动对应的 GitHub Actions 尚未复验。
