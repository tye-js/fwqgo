/**
 * 把错误对象的 message 转成「给管理员看」的一行文案。
 *
 * 生产构建里 Next 会隐藏服务端错误的原始信息，`error.message` 只剩下
 * `Minified React error #441; visit https://react.dev/errors/441 ...` 这种给框架开发者看的东西。
 * 直接铺在后台页面上会让人以为要去看 React 文档，而真正能对上日志的是 `error.digest`。
 * 所以这里把这类占位文案换成人话，其余情况原样透出（开发模式的消息是有用的）。
 */
const FRAMEWORK_PLACEHOLDER =
  /Minified React error|An error occurred in the Server Components render|Application error: a server-side exception/i;

export function describeAdminError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) return "未知错误";

  if (FRAMEWORK_PLACEHOLDER.test(message)) {
    return "服务端返回了未展开的错误详情（生产构建会隐藏原始信息）。请用下面的错误标识去服务端日志里检索。";
  }

  return message;
}
