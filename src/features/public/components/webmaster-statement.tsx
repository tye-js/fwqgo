import Link from "next/link";
import { MessageCircle, Send, ShieldCheck } from "lucide-react";

import { SITE_CONTACT } from "@/features/public/lib/site-contact";

export function WebmasterStatement() {
  return (
    <aside
      className="border-y border-border/70 bg-muted/20 px-4 py-4"
      aria-label="站长声明"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        站长声明
      </div>
      <div className="mt-2 text-sm leading-7 text-muted-foreground">
        本网站的宗旨是为站长、科研工作者和外贸达人提供便利，但请不要用作任何非法活动！本站的所有资料和资源全部来自互联网，本网站并不负责存储或提供下载服务。如果不小心侵犯了您的权益，请迅速与我们联系，我们会立即处理。
      </div>
      <div className="mt-2 text-sm leading-7 text-muted-foreground">
        支持免费投稿，需要联系👇
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        联系方式：
        <a
          href={SITE_CONTACT.qqGroup.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {SITE_CONTACT.qqGroup.label}
        </a>
        <a
          href={SITE_CONTACT.telegram.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="加入 Telegram 群组"
          className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Send className="size-4" aria-hidden="true" />
          {SITE_CONTACT.telegram.label}
        </a>
      </div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">
        我们的编辑原则、收录与排序规则、推广关系披露，
        <Link
          href="/about"
          prefetch={false}
          className="font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          更多说明见关于我们
        </Link>
        。
      </p>
    </aside>
  );
}
