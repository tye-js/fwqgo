import { z } from "zod";

import {
  parseProviderMonitorConfig,
  PROVIDER_SOURCE_ADAPTERS,
  PROVIDER_SOURCE_PURPOSES,
  type ProviderMonitorConfig,
  type ProviderSourceAdapter,
  type ProviderSourcePurpose,
} from "@fwqgo/core/provider-monitor-config";

export const PROVIDER_CATALOG_SCAN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "partial",
  "needs_auth",
  "failed",
  "cancelled",
] as const;

export type ProviderCatalogScanStatus =
  (typeof PROVIDER_CATALOG_SCAN_STATUSES)[number];

export type ProviderCatalogSourceMapping = {
  name: string;
  adapter: ProviderSourceAdapter;
  purpose: ProviderSourcePurpose;
  endpointUrl: string;
  confidence: number;
  reason: string;
  config: ProviderMonitorConfig;
};

export const defaultProviderCatalogDiscoveryPrompt = `你是服务器/VPS供应商公开套餐目录的结构映射器。你只能根据本次实际抓取并列出的页面，找出可以由确定性程序重复采集的套餐源，并生成字段映射。

供应商：{providerName}
配置的官网：{officialUrl}

本次实际抓取的公开页面（JSON）：
{pagesJson}

只输出一个紧凑 JSON 对象，不要输出 Markdown、解释或代码块。格式：
{
  "sources": [
    {
      "name": "便于后台识别的来源名",
      "adapter": "json|html|whmcs",
      "purpose": "catalog|promotion|stock",
      "endpointUrl": "必须逐字等于上述某个页面的 url",
      "confidence": 0.0,
      "reason": "为何该页面和映射可重复采集",
      "config": {}
    }
  ],
  "warnings": ["需要人工确认的限制"]
}

硬性规则：
1. endpointUrl 只能复制本次实际抓取页面的 url，不能猜测、拼接或改写 URL。
2. 只做字段路径或 CSS 选择器映射。不得计算价格、补全产品 ID、改写返利链接、生成套餐、推断缺失配置或编造字段值。
3. 公开 JSON 使用 json；确定为 WHMCS 购物车或产品组页面时优先使用 whmcs；其他服务端 HTML 使用 html。
4. config 必须符合对应适配器格式。请求头 headers 必须为空对象，不得输出 Cookie、Authorization、Token 或登录信息。
5. externalProductId 必须映射网站已有的稳定 ID、PID、产品 URL 或 data 属性；不能使用价格、CPU、内存等会变化的值组成 ID。
6. 价格只映射原始金额、币种、付款周期和各周期购买链接。不得自行换算月价、币种或折扣。
7. HTML/WHMCS 映射必须给出 itemSelector，以及 title、externalProductId、price、purchaseUrl 和尽可能多的配置字段选择器。不得输出 pattern 正则。JSON 映射必须给出 itemsPath 和对应字段路径。
8. 页面没有足够稳定的套餐结构、需要登录、只有客户端动态占位内容，或无法可靠取得稳定 ID 和价格时，不要输出 source，在 warnings 说明原因。
9. 最多输出 8 个互不重复的 source，confidence 必须在 0 到 1 之间。`;

const rawSourceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  adapter: z.enum(PROVIDER_SOURCE_ADAPTERS),
  purpose: z.enum(PROVIDER_SOURCE_PURPOSES).default("catalog"),
  endpointUrl: z.string().trim().url(),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
  reason: z.string().trim().max(2_000).default(""),
  config: z.record(z.string(), z.unknown()).default({}),
});

const rawOutputSchema = z.object({
  sources: z.array(z.unknown()).max(20).default([]),
  warnings: z.array(z.string().trim().max(2_000)).max(50).default([]),
});

function replaceTemplateVariable(
  template: string,
  variable: string,
  value: string,
) {
  return template.replaceAll(`{${variable}}`, value);
}

function hasHtmlFieldPattern(value: Record<string, unknown>) {
  const fields = value.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return false;
  }
  return Object.values(fields).some((field) => {
    if (field === null || typeof field !== "object" || Array.isArray(field)) {
      return false;
    }
    const pattern = (field as Record<string, unknown>).pattern;
    return typeof pattern === "string" && Boolean(pattern.trim());
  });
}

export function renderProviderCatalogDiscoveryPrompt(input: {
  template: string;
  providerName: string;
  officialUrl: string;
  pagesJson: string;
}) {
  return replaceTemplateVariable(
    replaceTemplateVariable(
      replaceTemplateVariable(
        input.template,
        "providerName",
        input.providerName,
      ),
      "officialUrl",
      input.officialUrl,
    ),
    "pagesJson",
    input.pagesJson,
  );
}

export function validateProviderCatalogAiOutput(input: {
  value: unknown;
  fetchedUrls: string[];
}) {
  const parsed = rawOutputSchema.parse(input.value);
  const fetchedUrls = new Set(input.fetchedUrls);
  const mappings: ProviderCatalogSourceMapping[] = [];
  const warnings = [...parsed.warnings];
  const uniqueSources = new Set<string>();

  for (const [index, value] of parsed.sources.entries()) {
    const source = rawSourceSchema.safeParse(value);
    if (!source.success) {
      warnings.push(
        `AI 来源 ${index + 1} 格式无效：${source.error.issues[0]?.message ?? "未知错误"}`,
      );
      continue;
    }

    const endpointUrl = source.data.endpointUrl;
    if (!fetchedUrls.has(endpointUrl)) {
      warnings.push(
        `AI 来源 ${index + 1} 使用了未包含在本次映射页面中的 URL，已忽略：${endpointUrl}`,
      );
      continue;
    }

    if (JSON.stringify(source.data.config).length > 50_000) {
      warnings.push(`AI 来源 ${index + 1} 字段映射过大，已忽略`);
      continue;
    }
    if (
      source.data.adapter !== "json" &&
      hasHtmlFieldPattern(source.data.config)
    ) {
      warnings.push(
        `AI 来源 ${index + 1} 包含不允许自动生成的字段正则，已忽略`,
      );
      continue;
    }

    const uniqueKey = `${source.data.adapter}:${endpointUrl}`;
    if (uniqueSources.has(uniqueKey)) {
      warnings.push(
        `AI 来源 ${index + 1} 与前一来源重复，已忽略：${endpointUrl}`,
      );
      continue;
    }

    try {
      const config = parseProviderMonitorConfig(
        { ...source.data.config, headers: {} },
        source.data.adapter,
      );
      uniqueSources.add(uniqueKey);
      mappings.push({
        ...source.data,
        endpointUrl,
        config,
      });
    } catch (error) {
      warnings.push(
        `AI 来源 ${index + 1} 字段映射无效，已忽略：${
          error instanceof Error ? error.message : "未知错误"
        }`,
      );
    }
  }

  return {
    mappings: mappings.slice(0, 8),
    warnings: [...new Set(warnings)],
  };
}

export function deriveProviderCatalogScanTerminalStatus(input: {
  succeeded: number;
  failed: number;
  acceptedCount: number;
  authFailure: boolean;
}): Extract<
  ProviderCatalogScanStatus,
  "succeeded" | "partial" | "needs_auth" | "failed"
> {
  if (input.succeeded === 0) {
    return input.authFailure ? "needs_auth" : "failed";
  }
  if (input.failed > 0 || input.acceptedCount === 0) return "partial";
  return "succeeded";
}

export function getProviderMonitorSuccessSchedule(
  scheduleMode: string,
  nextRunAt: Date,
) {
  return scheduleMode === "once"
    ? { enabled: false, nextRunAt: null }
    : { nextRunAt };
}
