export type PublicArticleCategoryLanguage = "zh" | "en";

type PublicArticleCategoryLabelSource = {
  name: string;
  slug: string;
  enName?: string | null;
};

type PublicArticleCategoryDescriptionSource = PublicArticleCategoryLabelSource & {
  description: string | null;
  enDescription?: string | null;
};

const categoryLabelOverrides: Record<
  string,
  Partial<Record<PublicArticleCategoryLanguage, string>>
> = {
  "cheap-vps": { zh: "便宜 VPS", en: "Cheap VPS" },
  "ddos-vps": { en: "DDoS Protected Servers" },
  "export-vps": { en: "Global Business Servers" },
  "free-vps": { zh: "免费服务器", en: "Free Server Offers" },
  fuwuqi: { en: "China Servers" },
  "hk-vps": { zh: "香港服务器", en: "Hong Kong VPS" },
  "isp-vps": { zh: "原生 IP 服务器", en: "Native IP Servers" },
  "jp-vps": { en: "Japan Servers" },
  "kr-vps": { en: "South Korea Servers" },
  "large-bandwidth-vps": {
    zh: "大带宽服务器",
    en: "High-Bandwidth Servers",
  },
  "unlimited-traffic-vps": { en: "Unmetered Servers" },
  "usa-vps": { en: "US VPS" },
  zztj: { en: "Editor's Picks" },
};

const categoryDescriptionOverrides: Record<
  string,
  Partial<Record<PublicArticleCategoryLanguage, string>>
> = {
  "cheap-vps": {
    zh: "便宜 VPS 分类整理低价、配置均衡的 VPS 和云服务器优惠，适合个人建站、轻量应用、博客、测试环境和入门业务。",
    en: "Low-cost VPS and cloud server deals for personal sites, lightweight apps, testing, and first deployments.",
  },
  "ddos-vps": {
    en: "DDoS-protected VPS, cloud, and dedicated server articles for public services that need attack filtering and incident response.",
  },
  "export-vps": {
    en: "Server deals and deployment guides for cross-border commerce, international websites, SaaS, and global business workloads.",
  },
  "free-vps": {
    zh: "免费服务器分类整理免费 VPS、云服务器试用和限时体验活动，适合学习、开发验证和低成本测试。",
    en: "Free VPS offers, cloud trials, and limited promotions for learning, development checks, and low-cost testing.",
  },
  fuwuqi: {
    en: "Mainland China cloud and server guides for low-latency websites, enterprise applications, and compliant deployments.",
  },
  "hk-vps": {
    zh: "香港服务器分类整理香港 CN2、CMI、直连和低延迟线路优惠，适合大陆访问、免备案建站与跨境业务。",
    en: "Hong Kong VPS guides covering CN2, CMI, direct routes, and low-latency options for nearby users.",
  },
  "isp-vps": {
    zh: "原生 IP 服务器分类汇总原生 IP、ISP IP 与住宅属性 IP 资源，适合跨境业务、社媒运营和账号环境隔离。",
    en: "Native IP and ISP server guides for cross-border services, social platforms, and isolated account environments. Verify provider claims before purchase.",
  },
  "jp-vps": {
    en: "Japan VPS and server deals for local services, games, international websites, and low-latency access across East Asia.",
  },
  "kr-vps": {
    en: "South Korea VPS and server articles for local services, games, content delivery, and low-latency East Asia access.",
  },
  "large-bandwidth-vps": {
    zh: "大带宽服务器分类汇总 1Gbps、10Gbps 及更高带宽的 VPS、云服务器和独立服务器，适合分发、直播与高并发业务。",
    en: "VPS, cloud, and dedicated server offers with 1Gbps, 10Gbps, or faster ports for delivery, streaming, and busy services.",
  },
  "unlimited-traffic-vps": {
    en: "VPS and cloud server offers with unmetered transfer or large monthly allowances for delivery and high-traffic services.",
  },
  "usa-vps": {
    en: "US VPS and server deals for websites, cross-border commerce, international services, and bandwidth-heavy workloads.",
  },
  zztj: {
    en: "Editor-selected VPS and server articles focused on stability, provider reputation, support, and long-term value.",
  },
};

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function publicArticleCategoryName(
  category: PublicArticleCategoryLabelSource,
  language: PublicArticleCategoryLanguage,
) {
  return (
    categoryLabelOverrides[category.slug]?.[language] ??
    (language === "en"
      ? nonEmptyTrim(category.enName) ?? category.name
      : category.name)
  );
}

export function publicArticleCategoryDescription(
  category: PublicArticleCategoryDescriptionSource,
  language: PublicArticleCategoryLanguage,
) {
  const override = categoryDescriptionOverrides[category.slug]?.[language];
  if (override) return override;
  if (language === "zh") return category.description;

  return (
    nonEmptyTrim(category.enDescription) ??
    `Articles, reviews, and buying guides for ${publicArticleCategoryName(category, "en")}.`
  );
}
