/**
 * 让脚本对**回环地址**的请求绕开本机代理。
 *
 * ## 为什么需要（实测机制）
 *
 * 本机若跑着 Clash / Surge 之类，环境里会有 `HTTP_PROXY` / `HTTPS_PROXY` 而**没有**
 * `NO_PROXY`。这时三件事叠加出一个很费时间的假故障：
 *
 * 1. `curl` 默认绕过 localhost —— 手测看不出问题；
 * 2. **Node 的 `fetch` 不读代理环境变量**，也没事；但 **Bun 的 `fetch` 会读**，
 *    于是 `http://127.0.0.1:<port>` 也被交给代理；
 * 3. 目标**还没起来**时，代理不是拒绝连接，而是回一个 **502 响应**，响应体是
 *    `upstream connect failed: Connection refused (os error 61)`、带 `retry-after`。
 *
 * 第 3 点是关键：等待服务就绪的循环通常只对**抛出的**连接错误重试，
 * 而 502 是一个**正常返回的响应**，于是循环立刻返回它，断言以
 * `web health returned 502` 失败 —— 看起来像产品故障，实际是环境问题。
 * 实测 `bun run smoke:built` 就是卡在这里（去掉本函数必失败、加上必通过，各两次）。
 *
 * ## 用法
 *
 * 在脚本顶部（任何 `fetch` 之前）调用一次即可。只往 `NO_PROXY` 追加回环地址，
 * 不动其他值。
 *
 * **只对「只访问自己起的回环服务」的脚本用。** 要访问公网的脚本不要调用 ——
 * 那会把本该走代理的流量直连出去。
 */
const LOOPBACK_HOSTS = "127.0.0.1,localhost,::1";

export function bypassProxyForLoopback() {
  for (const key of ["NO_PROXY", "no_proxy"]) {
    const current = process.env[key]?.trim();
    process.env[key] = current
      ? `${current},${LOOPBACK_HOSTS}`
      : LOOPBACK_HOSTS;
  }
}
