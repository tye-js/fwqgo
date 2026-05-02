import { AiFillQqCircle } from "react-icons/ai";
export function WebmasterStatement() {
  return (
    <div className="rounded-[26px] border border-border/70 bg-muted/20 p-5">
      <div className="font-editorial text-2xl font-semibold tracking-[-0.04em] text-foreground">
        站长声明
      </div>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <AiFillQqCircle className="size-9" />
        </div>
        <div className="text-sm leading-7 text-muted-foreground">
          本网站的宗旨是为站长、科研工作者和外贸达人提供便利，但请不要用作任何非法活动！本站的所有资料和资源全部来自互联网，本网站并不负责存储或提供下载服务。如果不小心侵犯了您的权益，请迅速与我们联系，我们会立即处理。
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground underline-offset-2">
        联系方式：
        <a
          href="https://qm.qq.com/q/WCugMBGEso"
          className="flex items-center gap-1 text-accent hover:underline"
        >
          <AiFillQqCircle className="size-4" />
          QQ群：601090215
        </a>
      </div>
    </div>
  );
}
