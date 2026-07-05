"use server";

import { randomUUID } from "crypto";
import { z } from "zod";

import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
} from "@fwqgo/scrape/article-scraper";
import { getAiRewriteContentLimit } from "@fwqgo/ai/article-rewriter";
import {
  getActiveAiRewriteConfig,
  getAiRewriteConfigs,
} from "@fwqgo/ai/rewrite-config";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  createAdminActionError,
  getErrorMessage,
  type AdminActionError,
} from "@/lib/admin-action-result";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";

const urlSchema = z.object({
  url: z.string().url(),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
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
  rewriteStyleId?: number;
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

function pruneScrapeJobs() {
  if (scrapeJobs.size <= MAX_SCRAPE_JOBS) return;

  const sortedJobs = [...scrapeJobs.values()].sort(
    (left, right) => left.updatedAt - right.updatedAt,
  );
  for (const job of sortedJobs.slice(0, scrapeJobs.size - MAX_SCRAPE_JOBS)) {
    scrapeJobs.delete(job.id);
  }
}

function createScrapeFailure(
  message: string,
  suggestion = "请检查来源 URL 是否可访问，或改用 AI 任务中心后台生成文章。",
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
  if (!job) return;

  scrapeJobs.set(jobId, {
    ...job,
    status: "running",
    updatedAt: Date.now(),
  });

  try {
    const config = await getActiveAiRewriteConfig(job.rewriteStyleId);
    const article = await withTimeout(
      scrapeArticleWithOptions({
        url: job.url,
        rewriteStyleId: job.rewriteStyleId,
        aiInputMaxLength: config
          ? getAiRewriteContentLimit(config.maxTokens)
          : undefined,
      }),
      "抓取改写超时，请稍后重试或换一个内容更短的来源",
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
        suggestion:
          "请检查来源 URL 是否可访问，或改用 AI 任务中心后台生成文章。",
      }),
      updatedAt: Date.now(),
    });
  }
}

export async function scrapeArticleAction(
  prevState: ScrapeActionState,
  formData: FormData,
): Promise<ScrapeActionState> {
  try {
    await requireAdminSession();

    const urlString = formData.get("url") as string;
    const rewriteStyleIdString = formData.get("rewriteStyleId");
    const { url, rewriteStyleId } = urlSchema.parse({
      url: urlString,
      rewriteStyleId:
        typeof rewriteStyleIdString === "string" && rewriteStyleIdString
          ? rewriteStyleIdString
          : undefined,
    });
    const jobId = randomUUID();
    scrapeJobs.set(jobId, {
      id: jobId,
      status: "queued",
      url,
      rewriteStyleId,
      data: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    pruneScrapeJobs();

    await enqueueAdminBackgroundJob({
      key: `scrape-article:${jobId}`,
      label: `抓取并改写文章：${url}`,
      maxAttempts: 1,
      run: () => runScrapeJob(jobId),
    });

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
          ? "正在后台抓取并改写文章"
          : "抓取任务排队中",
  };
}

export async function getAiRewriteStyleOptions() {
  await requireAdminSession();

  const configs = await getAiRewriteConfigs();
  return configs
    .filter((config) => config.enabled)
    .map((config) => ({
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      styleName: config.styleName,
      isDefault: config.isDefault,
      hasApiKey: config.hasApiKey,
    }));
}
