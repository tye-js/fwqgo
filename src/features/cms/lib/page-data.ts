/**
 * 后台页面数据加载的「失败不抛出」包装。
 *
 * ## 为什么需要它
 *
 * 后台页面在数据库连接抖动、迁移没跑完、慢查询超时时，读取会抛异常。不处理的话错误直接冒到
 * 框架默认错误页，整页白屏 —— 而实际上多数页面只是**某一块数据**没读到，完全可以降级渲染，
 * 并告诉管理员「哪一块读不到、下一步做什么」。
 *
 * 2026-09-23 之前这套降级 UI 已经写了 4 遍：`ai-rewrite/tasks` 里的 `loadPageData`
 * （全仓引用数 = 1）、`collect/homepage-promoted`、`knowledge`、`servers/monitor`
 * 各写各的 `try/catch` + 自定义 `{ok}` 形状。这里收成一个。
 *
 * ## 用法
 *
 * ```ts
 * const result = await loadPageData("首页推广位", Promise.all([a(), b()]));
 * if (result.error) {
 *   return <AdminSectionCard title="…暂时无法读取"><p>{result.error.message}</p></AdminSectionCard>;
 * }
 * const [a, b] = result.data;
 * ```
 *
 * 注意它**只负责取值**，不负责渲染 —— 每个页面该显示什么降级文案是页面自己的事。
 * 真正的兜底（连页面外壳都渲染不出来时）由 `apps/cms/app/(admin)/error.tsx` 负责。
 */
export type PageDataError = {
  /** 出错的数据块名，写进日志用于定位是哪个读取挂了。 */
  label: string;
  message: string;
};

export type PageDataResult<T> =
  | { data: T; error: null }
  | { data: null; error: PageDataError };

export function getPageDataErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export async function loadPageData<T>(
  label: string,
  promise: Promise<T>,
): Promise<PageDataResult<T>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    console.error(`${label} 加载失败:`, error);
    return {
      data: null,
      error: { label, message: getPageDataErrorMessage(error) },
    };
  }
}
