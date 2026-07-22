import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { HomepageSlotManager } from "@/features/cms/components/homepage-slot-manager";
import {
  getAdminHomepageSlots,
  getHomepageSlotReferenceTime,
  getHomepageSlotOptions,
  type HomepageSlotLanguage,
} from "@/server/homepage/homepage-slots";

function normalizeLanguage(value?: string): HomepageSlotLanguage {
  return value === "en" ? "en" : "zh";
}

function languageHref(language: HomepageSlotLanguage) {
  return language === "zh"
    ? "/collect/homepage-promoted"
    : "/collect/homepage-promoted?language=en";
}

async function loadHomepageSlotData(language: HomepageSlotLanguage) {
  try {
    const [slots, options] = await Promise.all([
      getAdminHomepageSlots(language),
      getHomepageSlotOptions(language),
    ]);
    return { ok: true as const, slots, options };
  } catch (error) {
    console.error("首页推广位加载失败:", error);
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}

async function HomepageSlotContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ language?: string }>;
}) {
  await connection();
  const searchParams = await searchParamsPromise;
  const language = normalizeLanguage(searchParams.language);
  const result = await loadHomepageSlotData(language);

  if (!result.ok) {
    return (
      <AdminPageShell
        badge="首页运营"
        title="首页推广位"
        description="管理首页推广文章、套餐和图片。"
      >
        <AdminSectionCard
          title="首页推广位暂时无法读取"
          description="请确认最新数据库迁移已执行，并检查 CMS 数据库连接。"
        >
          <p className="break-words text-sm text-destructive">
            {result.message}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const { slots, options } = result;
  const referenceTime = getHomepageSlotReferenceTime();

  return (
    <AdminPageShell
      badge="首页运营"
      title="首页推广位"
      actions={
        <div className="flex rounded-md border border-border/70 bg-background p-1">
          {(["zh", "en"] as const).map((item) => (
            <Button
              key={item}
              asChild
              size="sm"
              variant={language === item ? "default" : "ghost"}
            >
              <Link href={languageHref(item)}>
                {item === "zh" ? "中文" : "英文"}
              </Link>
            </Button>
          ))}
        </div>
      }
    >
      <AdminSectionCard
        title="推广位配置"
        description="前台只读取当前语言、位置和时间范围内有效的推广位；未配置时对应位置保持为空。"
      >
        <HomepageSlotManager
          slots={slots}
          options={options}
          language={language}
          referenceTime={referenceTime}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function HomepageSlotPage(props: {
  searchParams: Promise<{ language?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="首页运营"
          title="首页推广位"
          description="正在加载推广位、文章、套餐和图片资产。"
        />
      }
    >
      <HomepageSlotContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
