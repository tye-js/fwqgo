import type { ProviderCatalogSourceMapping } from "@fwqgo/core/provider-catalog-discovery";
import {
  parseProviderSourcePayload,
  prepareProviderOfferCandidates,
} from "@/server/offers/provider-source-parser";
import type { ProviderCatalogFetchedPage } from "@/server/providers/provider-catalog-discovery";

export type ProviderCatalogMappingPreflightFailure = {
  mapping: ProviderCatalogSourceMapping;
  message: string;
  matchedCount: number;
  validCount: number;
  rejectionReasons: Record<string, number>;
};

export type ProviderCatalogMappingPreflightResult = {
  acceptedMappings: ProviderCatalogSourceMapping[];
  failures: ProviderCatalogMappingPreflightFailure[];
};

function formatRejectionReasons(reasons: Record<string, number>) {
  return Object.entries(reasons)
    .map(([reason, count]) => `${reason} x${count}`)
    .join("；");
}

export function preflightProviderCatalogMappings(input: {
  pages: ProviderCatalogFetchedPage[];
  mappings: ProviderCatalogSourceMapping[];
}): ProviderCatalogMappingPreflightResult {
  const pageByUrl = new Map(input.pages.map((page) => [page.url, page]));
  const acceptedMappings: ProviderCatalogSourceMapping[] = [];
  const failures: ProviderCatalogMappingPreflightFailure[] = [];

  for (const mapping of input.mappings) {
    const page = pageByUrl.get(mapping.endpointUrl);
    if (!page) {
      failures.push({
        mapping,
        message: `没有找到映射 URL 对应的本次页面响应：${mapping.endpointUrl}`,
        matchedCount: 0,
        validCount: 0,
        rejectionReasons: {},
      });
      continue;
    }

    try {
      const candidates = parseProviderSourcePayload({
        adapter: mapping.adapter,
        body: page.rawBody,
        config: mapping.config,
        sourceUrl: page.url,
      });
      if (candidates.length === 0) {
        failures.push({
          mapping,
          message:
            mapping.adapter === "json"
              ? "itemsPath 没有匹配到任何套餐项"
              : "itemSelector 没有匹配到任何套餐项",
          matchedCount: 0,
          validCount: 0,
          rejectionReasons: {},
        });
        continue;
      }

      const prepared = prepareProviderOfferCandidates(
        candidates,
        mapping.config.requiredSpecCount,
      );
      if (prepared.syncableCandidates.length === 0) {
        const reasons = formatRejectionReasons(prepared.rejectionReasons);
        failures.push({
          mapping,
          message: `匹配 ${candidates.length} 项，但没有套餐满足最低入库要求${
            reasons ? `：${reasons}` : ""
          }`,
          matchedCount: candidates.length,
          validCount: 0,
          rejectionReasons: prepared.rejectionReasons,
        });
        continue;
      }

      acceptedMappings.push(mapping);
    } catch (error) {
      failures.push({
        mapping,
        message: `映射解析失败：${
          error instanceof Error ? error.message : "未知错误"
        }`,
        matchedCount: 0,
        validCount: 0,
        rejectionReasons: {},
      });
    }
  }

  return { acceptedMappings, failures };
}

export function formatProviderCatalogPreflightFailure(
  failure: ProviderCatalogMappingPreflightFailure,
) {
  return `来源「${failure.mapping.name}」(${failure.mapping.endpointUrl})：${failure.message}`;
}

export function buildProviderCatalogMappingRepairPrompt(input: {
  originalPrompt: string;
  previousResponse: string;
  failures: ProviderCatalogMappingPreflightFailure[];
}) {
  const diagnostics = input.failures
    .map((failure, index) =>
      [
        `${index + 1}. ${formatProviderCatalogPreflightFailure(failure)}`,
        `失败映射：${JSON.stringify(failure.mapping)}`,
      ].join("\n"),
    )
    .join("\n");

  return `${input.originalPrompt}

--- 本次真实页面预检失败，执行一次映射纠错 ---
上一次 AI 输出：
${input.previousResponse}

确定性解析器的预检结果：
${diagnostics}

请根据上方同一批页面的 structure 重新输出完整 JSON。只修复失败来源，不要重复已经通过预检的来源。
HTML/WHMCS 的每个 CSS 选择器必须逐字来自页面 structure，并能在对应 endpointUrl 的页面中实际命中。产品 ID 位于购买链接查询参数时，可以让 externalProductId 与 purchaseUrl 读取同一个 href，解析器会提取 PID/GID 并归一化；不要把带跟踪参数的完整购买 URL 当作稳定 ID，也不得编造根节点 data 属性。不得通过降低 requiredSpecCount 掩盖缺失字段，不得编造页面中不存在的套餐、价格、配置或链接。`;
}

export function formatProviderCatalogAiAudit(input: {
  initial: string;
  repair?: string;
}) {
  if (!input.repair) return input.initial;
  return `【初次映射】\n${input.initial}\n\n【预检纠错】\n${input.repair}`;
}
