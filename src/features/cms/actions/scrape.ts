"use server";

import { randomUUID } from "crypto";
import { z } from "zod";

import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
} from "@/server/scrape/article-scraper";
import { reserveBoundedMapCapacity } from "@fwqgo/core/bounded-map";
import { isPublicHttpUrl } from "@fwqgo/core/network-url";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  createAdminActionError,
  getErrorMessage,
  type AdminActionError,
} from "@/lib/admin-action-result";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { withAdminAudit } from "@/features/cms/lib/admin-audit";

const urlSchema = z.object({
  url: z.string().trim().url().refine(isPublicHttpUrl, {
    message:
      "抓取 URL 只允许公网 http/https 地址，不能使用 localhost 或内网地址",
  }),
});
const SCRAPE_ACTION_TIMEOUT_MS = 330_000;

export type ScrapeActionState = {
  success: boolean;
  data: ScrapedArticle | null;
  error: string | null;
  status?: ScrapeJobStatus;
  queued?: boolean;
  jobId?: string;
  message?: string;
  actionError?: AdminActionError;
};

type ScrapeJobStatus = "queued" | "running" | "success" | "failed";

type ScrapeJob = {
  id: string;
  status: ScrapeJobStatus;
  url: string;
  data: ScrapedArticle | null;
  error: string | null;
  actionError?: AdminActionError;
  createdAt: number;
  updatedAt: number;
};

const scrapeJobs = new Map<string, ScrapeJob>();
const MAX_SCRAPE_JOBS = 50;

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, SCRAPE_ACTION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function createScrapeFailure(
  message: string,
  suggestion = "请检查来源 URL 是否可访问，或改用文章生产台准备素材。",
): ScrapeActionState {
  return {
    success: false,
    data: null,
    error: message,
    status: "failed",
    actionError: createAdminActionError({
      title: "抓取失败",
      message,
      suggestion,
    }),
  };
}

async function runScrapeJob(jobId: string) {
  const job = scrapeJobs.get(jobId);
  if (!job) {
    throw new Error("抓取任务状态已丢失，请重新提交任务");
  }

  scrapeJobs.set(jobId, {
    ...job,
    status: "running",
    updatedAt: Date.now(),
  });

  try {
    const article = await withTimeout(
      scrapeArticleWithOptions({ url: job.url }),
      "抓取超时，请稍后重试或检查来源网页",
    );

    scrapeJobs.set(jobId, {
      ...job,
      status: "success",
      data: article,
      error: null,
      updatedAt: Date.now(),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    scrapeJobs.set(jobId, {
      ...job,
      status: "failed",
      data: null,
      error: message,
      actionError: createAdminActionError({
        title: "抓取失败",
        message,
        suggestion: "请检查来源 URL 是否可访问，或改用文章生产台准备素材。",
      }),
      updatedAt: Date.now(),
    });
  }
}

async function scrapeArticleActionImpl(
  prevState: ScrapeActionState,
  formData: FormData,
): Promise<ScrapeActionState> {
  try {
    await requireAdminSession();

    const { url } = urlSchema.parse({ url: formData.get("url") });
    const hasCapacity = reserveBoundedMapCapacity(scrapeJobs, {
      maxEntries: MAX_SCRAPE_JOBS,
      isEvictable: (job) => job.status === "success" || job.status === "failed",
      getEvictionPriority: (job) => job.updatedAt,
    });
    if (!hasCapacity) {
      return createScrapeFailure(
        "当前活跃抓取任务过多",
        "请等待现有抓取任务完成后再重试。",
      );
    }

    const jobId = randomUUID();
    scrapeJobs.set(jobId, {
      id: jobId,
      status: "queued",
      url,
      data: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    try {
      await enqueueAdminBackgroundJob({
        key: `scrape-article:${jobId}`,
        label: `抓取并清洗文章：${url}`,
        maxAttempts: 1,
        run: () => runScrapeJob(jobId),
      });
    } catch (error) {
      scrapeJobs.delete(jobId);
      throw error;
    }

    return {
      success: true,
      data: null,
      error: null,
      queued: true,
      status: "queued",
      jobId,
      message: "抓取任务已进入后台，完成后会自动填入表单。",
    };
  } catch (error) {
    console.error("Scraping error:", error);
    return createScrapeFailure(getErrorMessage(error));
  }
}

export const scrapeArticleAction = withAdminAudit(
  {
    action: "article.scrape",
    entityType: "post",
  },
  scrapeArticleActionImpl,
);

export async function getScrapeArticleJobStatusAction(
  jobId: string,
): Promise<ScrapeActionState> {
  await requireAdminSession();

  const job = scrapeJobs.get(jobId);
  if (!job) {
    return createScrapeFailure(
      "没有找到这个抓取任务",
      "任务可能已完成太久或服务刚刚重启，请重新提交抓取。",
    );
  }

  if (job.status === "failed") {
    return {
      success: false,
      data: null,
      error: job.error ?? "抓取失败",
      status: "failed",
      jobId,
      actionError: job.actionError,
    };
  }

  return {
    success: job.status === "success",
    data: job.data,
    error: null,
    status: job.status,
    queued: job.status === "queued" || job.status === "running",
    jobId,
    message:
      job.status === "success"
        ? "文章抓取完成"
        : job.status === "running"
          ? "正在后台抓取并清洗文章"
          : "抓取任务排队中",
  };
}
