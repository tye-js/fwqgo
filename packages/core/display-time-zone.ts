/**
 * 展示层统一时区。
 *
 * 本项目的时间模型是「UTC 墙钟」：`timestamp()` 列不带时区、数据库连接
 * `TimeZone=UTC`、生产进程由 PM2 强制 `TZ=UTC`。因此任何面向用户的日期
 * 格式化都必须显式传入 `timeZone`，否则：
 *
 * - 服务端按 UTC 渲染，与北京时间相差 8 小时；
 * - 客户端按浏览器本地时区渲染，同一时间在 SSR 与 CSR 得到不同字符串，
 *   触发 hydration 文本不一致。
 *
 * 「墙钟」模型只在所有写入方都守规矩时才成立。`posts."createdAt"` /
 * `"updatedAt"` 已经改成 `timestamptz`（迁移 0078）：这两列会被 psql、后台
 * 脚本直接写，而 psql 的 session 时区是 Asia/Shanghai，`now()` 落库就比真实
 * 时刻多 8 小时，展示时再 +8 会跨到第二天。带时区列存的是绝对时刻，写入方
 * 的时区不再影响结果。
 *
 * 新增日期展示时统一使用该常量，不要依赖进程或浏览器本地时区。
 */
export const DISPLAY_TIME_ZONE = "Asia/Shanghai";
