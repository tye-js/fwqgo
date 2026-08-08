import {
  SUITABILITY_SCENARIOS,
  type ServerFitCollectionInput,
  type ServerFitCollectionResult,
  type ServerFitOffer,
  type ServerFitRecommendation,
  type SuitabilityFit,
  type SuitabilityScenario,
} from "./input";

function text(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function includesAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term));
}

function regionFamily(value: string | null) {
  const normalized = text(value);
  if (!normalized) return "unknown" as const;
  if (includesAny(normalized, ["香港", "hong kong", "hong-kong", "hk"])) {
    return "hong_kong" as const;
  }
  if (
    includesAny(normalized, [
      "日本",
      "japan",
      "东京",
      "大阪",
      "singapore",
      "新加坡",
    ])
  ) {
    return "asia" as const;
  }
  if (
    includesAny(normalized, [
      "美国",
      "us west",
      "usa",
      "los angeles",
      "洛杉矶",
      "san jose",
      "圣何塞",
    ])
  ) {
    return "us_west" as const;
  }
  return "other" as const;
}

function lineText(offer: ServerFitOffer) {
  return `${text(offer.lineType)} ${text(offer.region)}`;
}

function hasOptimizedAsiaLine(offers: ServerFitOffer[]) {
  return offers.some((offer) =>
    includesAny(lineText(offer), [
      "cn2",
      "cn2 gia",
      "cn2 gt",
      "cuii",
      "as9929",
      "as4837",
      "cmi",
      "cmin2",
    ]),
  );
}

function hasKnownRegion(offers: ServerFitOffer[]) {
  return offers.some((offer) => regionFamily(offer.region) !== "unknown");
}

function hasAnyLine(offers: ServerFitOffer[]) {
  return offers.some((offer) => Boolean(text(offer.lineType)));
}

function hasAll(offers: ServerFitOffer[], field: keyof ServerFitOffer) {
  return (
    offers.length > 0 &&
    offers.every((offer) => {
      const value = offer[field];
      return typeof value === "number"
        ? Number.isFinite(value) && value > 0
        : Boolean(text(value));
    })
  );
}

function hasSome(offers: ServerFitOffer[], field: keyof ServerFitOffer) {
  return offers.some((offer) => {
    const value = offer[field];
    return typeof value === "number"
      ? Number.isFinite(value) && value > 0
      : Boolean(text(value));
  });
}

function missing(
  offers: ServerFitOffer[],
  fields: Array<[keyof ServerFitOffer, string]>,
) {
  return fields
    .filter(([field]) => !hasSome(offers, field))
    .map(([, label]) => label);
}

function recommendation(
  scenario: SuitabilityScenario,
  input: {
    fit: SuitabilityFit;
    suitable: string[];
    conditional: string[];
    unsuitable: string[];
    check: string[];
    missing?: string[];
  },
): ServerFitRecommendation {
  return {
    scenario,
    fit: input.fit,
    usuallySuitable: input.suitable,
    conditional: input.conditional,
    usuallyUnsuitable: input.unsuitable,
    checkBeforeOrder: input.check,
    missingFields: input.missing ?? [],
  };
}

function evaluateScenario(
  scenario: SuitabilityScenario,
  offers: ServerFitOffer[],
): ServerFitRecommendation {
  if (offers.length === 0) {
    return recommendation(scenario, {
      fit: "insufficient_data",
      suitable: [],
      conditional: [],
      unsuitable: [],
      check: ["当前表格没有可评估的结构化套餐。"],
    });
  }

  const knownRegion = hasKnownRegion(offers);
  const knownLine = hasAnyLine(offers);
  const asia = offers.some((offer) =>
    ["hong_kong", "asia"].includes(regionFamily(offer.region)),
  );
  const usWest = offers.some(
    (offer) => regionFamily(offer.region) === "us_west",
  );
  const resourceFields = missing(offers, [
    ["memoryMb", "内存"],
    ["storageGb", "存储容量"],
    ["bandwidthMbps", "带宽"],
    ["trafficGb", "月流量"],
  ]);
  const computeFields = missing(offers, [
    ["vcpuCount", "vCPU 数"],
    ["memoryMb", "内存"],
  ]);
  const ipFields = missing(offers, [
    ["ipv4", "IPv4"],
    ["ipv6", "IPv6"],
  ]);

  switch (scenario) {
    case "mainland_web_api":
      return recommendation(scenario, {
        fit: !knownRegion
          ? "insufficient_data"
          : asia && knownLine
            ? "usually_suitable"
            : "conditional",
        suitable: asia
          ? ["香港、日本、新加坡等亚洲地区，通常更适合大陆用户访问。"]
          : [],
        conditional: [
          "电信、联通、移动的实际体验可能不同，线路名称只能缩小候选范围。",
          "如果表格未明确线路，需把候选套餐放到购买前测试清单中。",
        ],
        unsuitable:
          usWest && !asia
            ? ["仅有美西且没有明确优化线路的套餐，不宜默认作为大陆用户主站。"]
            : [],
        check: [
          "按主要省份和运营商分别测试真实网站、API、SSH；不要把平均 ping 当成业务保证。",
        ],
        missing: missing(offers, [
          ["region", "机房地区"],
          ["lineType", "线路"],
        ]),
      });
    case "overseas_web_api":
      return recommendation(scenario, {
        fit: !knownRegion
          ? "insufficient_data"
          : knownRegion && resourceFields.length === 0
            ? "usually_suitable"
            : "conditional",
        suitable:
          usWest || asia
            ? [
                "面向海外用户时，亚洲或美西机房可作为候选，重点看用户分布和上游依赖。",
              ]
            : [],
        conditional: [
          "多地区用户不要只按机房距离选型，需考虑 CDN、源站回源和上游服务位置。",
        ],
        unsuitable: [],
        check: [
          "核对 vCPU、内存、存储、带宽、流量和备份条款；没有结构化字段时不要按宣传文案补推。",
        ],
        missing: [
          ...missing(offers, [["region", "机房地区"]]),
          ...resourceFields,
        ],
      });
    case "mixed_audience":
      return recommendation(scenario, {
        fit:
          asia && (usWest || offers.length > 1)
            ? "conditional"
            : !knownRegion
              ? "insufficient_data"
              : "usually_unsuitable",
        suitable: asia ? ["亚洲机房可作为大陆访问入口或源站候选。"] : [],
        conditional: [
          "大陆与海外同时访问时，通常需要 CDN、双区域或分流设计，单台服务器很难同时优化所有用户。",
        ],
        unsuitable: !asia
          ? ["只有单一远端地区且没有分发/分流方案时，不宜承诺两地体验都好。"]
          : [],
        check: [
          "先确定大陆、海外两侧流量占比，再分别验收访问、回源、DNS 和故障切换。",
        ],
        missing: missing(offers, [
          ["region", "机房地区"],
          ["lineType", "线路"],
        ]),
      });
    case "remote_ai_development":
      return recommendation(scenario, {
        fit:
          !knownRegion || !hasSome(offers, "bandwidthMbps")
            ? "insufficient_data"
            : computeFields.length === 0
              ? "usually_suitable"
              : "conditional",
        suitable: [
          "Codex、Claude Code、Remote IDE 等远程开发场景通常更看重 SSH 可达性、交互稳定性和开发者所在地到服务器的路径。",
        ],
        conditional: [
          "海外服务器不等于提供 GPU；本判断只覆盖远程开发环境，不覆盖本地模型推理。",
        ],
        unsuitable: [],
        check: [
          "购买前确认 SSH 端口、密钥登录、终端长连接、Docker/开发工具兼容性，并从实际办公网络试用。",
        ],
        missing: [
          ...missing(offers, [
            ["region", "机房地区"],
            ["bandwidthMbps", "带宽"],
          ]),
          ...computeFields,
        ],
      });
    case "ai_api_backend":
      return recommendation(scenario, {
        fit:
          !knownRegion || ipFields.length === 2
            ? "insufficient_data"
            : computeFields.length === 0 && knownLine
              ? "usually_suitable"
              : "conditional",
        suitable: [
          "AI API/Agent 后端可优先选择靠近上游 AI 服务和主要用户的地区，并把 IP 属性与服务政策一起核对。",
        ],
        conditional: [
          "上游服务的地区、账号、IP 风控和条款可能变化，线路好不代表 API 一定可用。",
        ],
        unsuitable: [],
        check: [
          "核对目标 AI 服务的地区政策、IP/ASN 属性、出口稳定性、超时策略和备用上游。",
        ],
        missing: [
          ...missing(offers, [
            ["region", "机房地区"],
            ["lineType", "线路"],
          ]),
          ...computeFields,
          ...(ipFields.length === 2 ? ["IP 信息"] : []),
        ],
      });
    case "transactional_ecommerce":
      return recommendation(scenario, {
        fit: !knownRegion
          ? "insufficient_data"
          : computeFields.length === 0 && ipFields.length < 2
            ? "conditional"
            : resourceFields.length === 0
              ? "usually_suitable"
              : "conditional",
        suitable: [
          "跨境电商通常需要同时关注大陆访问、海外用户、支付回调、IP 属性和恢复能力。",
        ],
        conditional: [
          "单台低价 VPS 不能替代订单、支付、数据库和备份的故障隔离。",
        ],
        unsuitable: [],
        check: [
          "核对支付/风控服务对地区与 IP 的要求，并演练备份恢复、回滚和关键依赖不可用时的降级。",
        ],
        missing: [
          ...missing(offers, [["region", "机房地区"]]),
          ...computeFields,
          ...resourceFields,
        ],
      });
    case "realtime_service":
      return recommendation(scenario, {
        fit:
          !knownRegion || !knownLine
            ? "insufficient_data"
            : hasOptimizedAsiaLine(offers)
              ? "usually_suitable"
              : "conditional",
        suitable: hasOptimizedAsiaLine(offers)
          ? ["明确线路且靠近主要用户的候选，通常更适合低延迟、交互敏感服务。"]
          : [],
        conditional: [
          "电信、联通、移动的路径可能不同；实时业务不能只凭地区或线路名称承诺体验。",
        ],
        unsuitable: [],
        check: [
          "用真实协议和客户端测首包、持续连接、重连、抖动和高峰时段表现。",
        ],
        missing: missing(offers, [
          ["region", "机房地区"],
          ["lineType", "线路"],
          ["bandwidthMbps", "带宽"],
        ]),
      });
    case "large_transfer":
      return recommendation(scenario, {
        fit:
          !hasSome(offers, "bandwidthMbps") || !hasSome(offers, "trafficGb")
            ? "insufficient_data"
            : hasAll(offers, "bandwidthMbps") && hasAll(offers, "trafficGb")
              ? "usually_suitable"
              : "conditional",
        suitable: [
          "大文件、备份、下载分发优先看结构化带宽和流量字段，而不是只看端口宣传。",
        ],
        conditional: [
          "出口方向、共享带宽、单连接限制、计费方向和高峰策略仍需向商家确认。",
        ],
        unsuitable: [],
        check: [
          "按备份窗口或下载峰值计算所需吞吐，并用真实目标端点复测；不要把测速结果当成长期保证。",
        ],
        missing: missing(offers, [
          ["bandwidthMbps", "带宽"],
          ["trafficGb", "月流量"],
        ]),
      });
    case "self_hosted_streaming":
      return recommendation(scenario, {
        fit:
          !hasSome(offers, "bandwidthMbps") || !hasSome(offers, "trafficGb")
            ? "insufficient_data"
            : resourceFields.length === 0
              ? "usually_suitable"
              : "conditional",
        suitable: [
          "自建流媒体首先需要足够的出口带宽、流量额度、存储和内容分发方案。",
        ],
        conditional: [
          "单台服务器适合小规模或测试流媒体；增长后通常需要 CDN、对象存储或多节点。",
        ],
        unsuitable: [],
        check: [
          "核对带宽是否共享、流量计费方向、版权/内容政策、磁盘容量和备份恢复。",
        ],
        missing: [
          ...missing(offers, [
            ["bandwidthMbps", "带宽"],
            ["trafficGb", "月流量"],
            ["storageGb", "存储容量"],
          ]),
          ...computeFields,
        ],
      });
    case "third_party_streaming_access":
      return recommendation(scenario, {
        fit: !knownRegion
          ? "insufficient_data"
          : ipFields.length === 0
            ? "usually_suitable"
            : "conditional",
        suitable: [
          "访问第三方流媒体时，地区、出口 IP/ASN 和服务政策通常比 CPU 更关键。",
        ],
        conditional: [
          "地区库、代理检测和平台政策会变化，同一机房不同 IP 也可能结果不同。",
        ],
        unsuitable: [],
        check: [
          "购买前用目标账号和目标平台在测试 IP 上实际验证；不要根据‘原生/住宅’标签作保证。",
        ],
        missing: [
          ...missing(offers, [["region", "机房地区"]]),
          ...(ipFields.length ? ["IP 信息"] : []),
        ],
      });
    case "dev_test":
      return recommendation(scenario, {
        fit:
          knownRegion && computeFields.length === 0
            ? "usually_suitable"
            : knownRegion
              ? "conditional"
              : "insufficient_data",
        suitable: [
          "开发测试、临时服务和学习环境通常可以先选资源边界清楚、可随时备份和迁移的入门套餐。",
        ],
        conditional: [
          "低价套餐适合测试不代表适合长期生产；需确认续费、退款、资源争用和数据可恢复性。",
        ],
        unsuitable: [],
        check: ["先用短周期验证镜像、端口、Docker、备份和销毁/迁移流程。"],
        missing: [
          ...missing(offers, [["region", "机房地区"]]),
          ...computeFields,
        ],
      });
  }
}

function overallFit(
  recommendations: ServerFitRecommendation[],
): SuitabilityFit {
  if (recommendations.length === 0) return "insufficient_data";
  if (recommendations.every((item) => item.fit === "insufficient_data"))
    return "insufficient_data";
  if (recommendations.some((item) => item.fit === "usually_suitable"))
    return "conditional";
  if (recommendations.every((item) => item.fit === "usually_unsuitable"))
    return "usually_unsuitable";
  return "conditional";
}

export function evaluateServerOfferCollection(
  input: ServerFitCollectionInput,
): ServerFitCollectionResult {
  const scenarios = input.scenarios?.length
    ? input.scenarios
    : [...SUITABILITY_SCENARIOS];
  const recommendations = scenarios.map((scenario) =>
    evaluateScenario(scenario, input.offers),
  );
  const fit = overallFit(recommendations);
  const scope = input.scopeLabel?.trim() ?? "当前套餐表";
  const summary =
    input.offers.length === 0
      ? `${scope}暂无可用于适配判断的套餐。`
      : fit === "insufficient_data"
        ? `${scope}的地区、线路或配置字段不完整，当前只能提示核对项目，不能直接判断是否适合。`
        : `${scope}按经验规则提供场景化参考，不代表线路质量、性能或上游服务可用性保证；最终结果以用户自己的测试为准。`;

  return {
    schemaVersion: 1,
    scopeKind: input.scopeKind,
    scopeLabel: input.scopeLabel?.trim() ?? null,
    offerCount: input.offers.length,
    overallFit: fit,
    overallSummary: summary,
    recommendations,
  };
}
