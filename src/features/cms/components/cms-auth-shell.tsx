import type { ReactNode } from "react";
import { FileInput, PenLine, Images } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export function CmsAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0 space-y-6 px-1 lg:pr-6">
        <BrandLogo compact />
        <div>
          <p className="cms-kicker mb-3">FWQGO CONTENT WORKSPACE</p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
            让每一次内容更新，
            <br className="hidden lg:block" />
            都有清晰的下一步。
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            在一个工作空间里完成采集、编辑、双语内容与媒体管理，把注意力留给真正重要的内容。
          </p>
        </div>
        <div className="hidden max-w-lg space-y-3 lg:block">
          {[
            {
              icon: FileInput,
              title: "采集入稿",
              description: "保留完整来源，进入草稿继续完善",
            },
            {
              icon: PenLine,
              title: "编辑与发布",
              description: "集中维护正文、SEO 和中英文版本",
            },
            {
              icon: Images,
              title: "媒体与任务",
              description: "管理封面、图片资产与处理进度",
            },
          ].map(({ icon: Icon, title, description }, index) => (
            <div key={title} className="cms-panel flex items-center gap-4 p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {description}
                </p>
              </div>
              <span
                className="font-mono text-xs text-muted-foreground"
                aria-hidden="true"
              >
                0{index + 1}
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="min-w-0">
        {children}
        <p className="mt-5 text-center text-xs leading-6 text-muted-foreground">
          FWQGO · 内容管理工作空间
        </p>
      </div>
    </div>
  );
}
