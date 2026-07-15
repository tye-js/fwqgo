import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
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
  const activeCount = slots.filter((slot) => slot.enabled).length;
  const imageCount = slots.filter(
    (slot) => slot.contentType === "image_link",
  ).length;

  return (
    <AdminPageShell
      badge="首页运营"
      title="首页推广位"
      description="统一管理首页推广文章、精选套餐和推广图片，支持中文/英文、固定位置、排序和定时上下线。"
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
      <AdminSummaryStrip
        items={[
          {
            label: "推广位",
            value: String(slots.length),
            note: `${activeCount} 个已启用`,
          },
          {
            label: "推广图片",
            value: String(imageCount),
            note: "使用图片资产并跳转",
          },
          {
            label: "可选内容",
            value: String(
              options.postOptions.length + options.offerOptions.length,
            ),
            note: "已发布文章和可见套餐",
          },
        ]}
      />
      <AdminSectionCard
        title="推广位配置"
        description="无新推广位时，前台继续读取原首页推荐文章；新配置生效后按位置接管对应区域。"
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
