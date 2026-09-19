import type { PublicLanguage } from "@/features/public/lib/site-contact";

export type TrustSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type TrustChannel = {
  id: string;
  label: string;
  description: string;
  href: string;
  external?: boolean;
};

export type TrustDocument = {
  seoTitle: string;
  description: string;
  kicker: string;
  heading: string;
  intro: string;
  updatedAt: string;
  sections: TrustSection[];
  channels?: TrustChannel[];
};

const UPDATED_AT = "2026-09-19";

const documents: Record<
  "about" | "contact" | "privacy" | "terms" | "affiliate-disclosure",
  Record<PublicLanguage, TrustDocument>
> = {
  // ---------------------------------------------------------------- about
  about: {
    zh: {
      seoTitle: "关于我们 - 服务器go",
      description:
        "服务器go 是一个独立的服务器选购研究站：汇总 VPS、云服务器与独立服务器的公开套餐信息，整理成可筛选可比较的条目，并用知识库和选购工具补齐判断依据。",
      kicker: "关于服务器GO",
      heading: "我们只做一件事：把服务器这件事讲清楚。",
      intro:
        "服务器GO 是一个独立的服务器选购研究站。我们汇总 VPS、云服务器与独立服务器的公开套餐信息，整理成可筛选、可比较的条目，并用知识库和选购工具补齐判断依据。",
      updatedAt: UPDATED_AT,
      sections: [],
    },
    en: {
      seoTitle: "About - fwqgo",
      description:
        "fwqgo is an independent research site for server buying decisions: we collect public VPS, cloud and dedicated server plans into filterable entries, and back them with a knowledge base and sizing tools.",
      kicker: "ABOUT FWQGO",
      heading: "We make server decisions easier to verify.",
      intro:
        "fwqgo is an independent research site for server buying decisions. We collect publicly available VPS, cloud and dedicated server plans into entries you can filter and compare, then back them with a knowledge base and sizing tools.",
      updatedAt: UPDATED_AT,
      sections: [],
    },
  },

  // -------------------------------------------------------------- contact
  contact: {
    zh: {
      seoTitle: "联系我们 - 服务器go",
      description:
        "服务器go 的联系方式：内容纠错、投稿、商家提交优惠与商务合作，按角色分流，邮件与社群入口都在这里。",
      kicker: "联系我们",
      heading: "找对人，比找对入口更重要。",
      intro:
        "为了让你少绕路，我们按身份把入口分开。选择最接近你情况的一项，通常能更快得到回复。",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "response-time",
          heading: "回复时间",
          paragraphs: [
            "邮件通常会在 3 个工作日内回复。社群消息由站长和志愿者维护，响应速度取决于在线情况，紧急事项请优先使用邮件。",
          ],
        },
        {
          id: "what-to-include",
          heading: "发信时请附上这些信息",
          paragraphs: [
            "信息越具体，我们核实得越快。缺少可核验依据的反馈，我们无法直接修改内容。",
          ],
          bullets: [
            "出现问题的页面完整地址（URL）",
            "你认为有误的具体字段，例如价格、地区、线路或库存状态",
            "你看到的正确值，以及它的公开来源链接",
          ],
        },
      ],
      channels: [
        {
          id: "reader",
          label: "我是读者：报告内容错误",
          description:
            "发现价格过期、参数错误或购买链接失效，请直接把页面地址和正确来源发给我们。",
          href: "email",
        },
        {
          id: "author",
          label: "我是作者：投稿",
          description:
            "支持免费投稿，技术向、经验向内容都欢迎。请先在邮件里说明选题与大纲。",
          href: "email",
        },
        {
          id: "provider",
          label: "我是商家：提交优惠",
          description:
            "提供公开可核验的套餐信息与活动条件。收录不收费，排序也不出售。",
          href: "email",
        },
        {
          id: "partner",
          label: "商务与授权",
          description:
            "内容授权、数据引用、其他合作事项，请说明用途与范围。",
          href: "email",
        },
      ],
    },
    en: {
      seoTitle: "Contact - fwqgo",
      description:
        "How to reach fwqgo: report a content error, submit an article, send us a provider deal, or discuss licensing and partnerships.",
      kicker: "CONTACT",
      heading: "Reaching the right person beats finding the right form.",
      intro:
        "To save you a detour, we split our contact routes by who you are. Pick the closest match and you will usually get a faster answer.",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "response-time",
          heading: "Response time",
          paragraphs: [
            "Email is normally answered within three business days. Community channels are run by the site owner and volunteers, so response time depends on who is online. For anything urgent, use email.",
          ],
        },
        {
          id: "what-to-include",
          heading: "What to include",
          paragraphs: [
            "The more specific your report, the faster we can verify it. Without a checkable source we cannot change published data.",
          ],
          bullets: [
            "The full URL of the page in question",
            "The exact field you believe is wrong, such as price, region, route or stock status",
            "The value you believe is correct, plus a public source link for it",
          ],
        },
      ],
      channels: [
        {
          id: "reader",
          label: "Reader: report an error",
          description:
            "Expired prices, wrong specifications or dead purchase links — send the page URL and a source.",
          href: "email",
        },
        {
          id: "author",
          label: "Author: submit an article",
          description:
            "We accept free submissions, both technical and experience-based. Pitch the topic and outline by email first.",
          href: "email",
        },
        {
          id: "provider",
          label: "Provider: submit a deal",
          description:
            "Send publicly verifiable plan data and promotion terms. Listing is free and ranking is not for sale.",
          href: "email",
        },
        {
          id: "partner",
          label: "Licensing and partnerships",
          description:
            "Content licensing, data reuse and other cooperation. Tell us the intended use and scope.",
          href: "email",
        },
      ],
    },
  },

  // -------------------------------------------------------------- privacy
  privacy: {
    zh: {
      seoTitle: "隐私政策 - 服务器go",
      description:
        "服务器go 的隐私政策：我们收集哪些数据、如何使用、如何与第三方共享，以及你可以如何联系我们。",
      kicker: "隐私政策",
      heading: "我们尽量少收集，并且说清楚收集了什么。",
      intro:
        "这份政策说明服务器go 在提供公开内容与比价工具时会接触哪些数据、为什么接触，以及你可以如何联系我们。我们不做用户画像，也不出售任何数据。",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "what-we-collect",
          heading: "我们收集什么",
          paragraphs: [
            "本站不要求注册即可阅读任何公开内容，也不使用第三方广告网络或跨站跟踪脚本。",
            "文章页会记录一次聚合浏览量，用于在页面上展示该文章的阅读热度。这个计数只累加数字，不与任何个人身份关联，也不会写入浏览器的 Cookie 或本地存储。",
          ],
          bullets: [
            "聚合浏览量：文章被打开的次数，仅用于展示热度",
            "你主动发送的信息：通过邮件或社群联系我们时提供的内容",
          ],
        },
        {
          id: "cookies",
          heading: "Cookie 与本地存储",
          paragraphs: [
            "本站自身的页面不写入用于跟踪的 Cookie。站内搜索、筛选与分页状态通过 URL 参数表达，不会持久化到你的设备。",
            "内容分发由 Cloudflare 提供。Cloudflare 可能出于安全与反滥用目的设置必要的技术性 Cookie，这部分由其自身政策约束。",
          ],
        },
        {
          id: "third-parties",
          heading: "第三方与出站链接",
          paragraphs: [
            "站内的购买按钮会跳转到商家的官方网站。跳转之后你处在商家的页面上，其数据收集行为适用商家自己的隐私政策，我们无法控制。",
            "部分出站链接带有推广参数。这一点我们在《推广与佣金披露》页面中单独说明。",
          ],
        },
        {
          id: "retention",
          heading: "保留与安全",
          paragraphs: [
            "聚合浏览量为长期累计的统计数字，不包含可用于识别个人的信息。你通过邮件发送的内容我们会保留到事项处理完毕，之后按需要清理。",
          ],
        },
        {
          id: "your-choices",
          heading: "你的选择",
          paragraphs: [
            "你可以随时通过邮件要求我们说明或删除你主动提供的信息。如果你认为某个页面侵犯了你的权益，请提供具体地址与权利依据，我们核实后会尽快处理。",
          ],
        },
        {
          id: "changes",
          heading: "政策变更",
          paragraphs: [
            "政策如有实质性修改，我们会更新本页顶部的日期。继续使用本站即表示你接受更新后的版本。",
          ],
        },
      ],
    },
    en: {
      seoTitle: "Privacy Policy - fwqgo",
      description:
        "fwqgo's privacy policy: what data we collect, how we use it, how third parties are involved, and how to contact us about it.",
      kicker: "PRIVACY POLICY",
      heading: "We collect as little as possible, and say what we collect.",
      intro:
        "This policy explains what data fwqgo touches while serving public content and comparison tools, why we touch it, and how you can reach us. We do not build user profiles and we do not sell data.",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "what-we-collect",
          heading: "What we collect",
          paragraphs: [
            "No account is required to read any public content, and we run no third-party ad network or cross-site tracking script.",
            "Article pages record an aggregate view count so the page can show how widely a piece has been read. The counter only increments a number, is not linked to any identity, and is not written to cookies or local storage.",
          ],
          bullets: [
            "Aggregate view counts: how often an article was opened, shown only as popularity",
            "Information you send us: whatever you provide when contacting us by email or community channels",
          ],
        },
        {
          id: "cookies",
          heading: "Cookies and local storage",
          paragraphs: [
            "Our own pages do not set tracking cookies. Search, filters and pagination are expressed as URL parameters and are not persisted on your device.",
            "Content delivery is provided by Cloudflare. Cloudflare may set strictly necessary technical cookies for security and abuse prevention, governed by its own policies.",
          ],
        },
        {
          id: "third-parties",
          heading: "Third parties and outbound links",
          paragraphs: [
            "Purchase buttons lead to the provider's own website. Once you follow one, you are on the provider's site and its data practices apply; we do not control them.",
            "Some outbound links carry promotion parameters. That is documented separately on our Affiliate Disclosure page.",
          ],
        },
        {
          id: "retention",
          heading: "Retention and security",
          paragraphs: [
            "Aggregate view counts are long-lived statistics that contain nothing that can identify a person. Messages you send us are kept until the matter is resolved, then cleaned up as needed.",
          ],
        },
        {
          id: "your-choices",
          heading: "Your choices",
          paragraphs: [
            "You can email us at any time to ask what we hold about you or to have it removed. If you believe a page infringes your rights, send us the exact URL and the basis for your claim and we will act promptly once verified.",
          ],
        },
        {
          id: "changes",
          heading: "Changes",
          paragraphs: [
            "If this policy changes materially we update the date at the top of this page. Continued use of the site means you accept the updated version.",
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------- terms
  terms: {
    zh: {
      seoTitle: "服务条款 - 服务器go",
      description:
        "服务器go 的服务条款：内容的使用范围、价格与库存的准确性边界、知识产权、禁止行为与责任限制。",
      kicker: "服务条款",
      heading: "先说清楚边界，再谈使用。",
      intro:
        "访问和使用服务器go 即表示你接受以下条款。我们把最容易产生误解的几条放在最前面，包括价格准确性、内容授权和责任范围。",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "accuracy",
          heading: "价格、库存与活动条件",
          paragraphs: [
            "站内的价格、配置、库存状态和优惠码来自商家公开页面与公告，我们按采集时点记录，并在页面上标注更新时间。",
            "商家的价格与活动条件随时可能变化。任何情况下，以下单时商家结算页显示的信息为准，站内展示不构成报价或购买承诺。",
          ],
        },
        {
          id: "no-advice",
          heading: "内容不构成购买建议",
          paragraphs: [
            "站内的测评、对比与知识库内容用于帮助你理解概念和缩小选择范围，不构成针对你具体业务的采购、合规或安全建议。",
            "最终选择需要你结合自身业务、预算、数据合规要求和商家条款自行判断。",
          ],
        },
        {
          id: "ip",
          heading: "知识产权",
          paragraphs: [
            "站内的原创文章、页面结构与工具界面归服务器go 所有。转载、摘编或用于训练用途前请先取得授权。",
            "商家的商标、Logo 与产品名称归各自权利人所有，本站仅作识别性使用。",
          ],
        },
        {
          id: "acceptable-use",
          heading: "禁止行为",
          paragraphs: ["为保证站点可用，以下行为被禁止："],
          bullets: [
            "对本站发起高频抓取，影响正常访问",
            "绕过或规避站点的访问限制与安全策略",
            "将站内内容用于欺诈、误导性宣传或违法用途",
            "以自动化方式批量提交表单或干扰服务运行",
          ],
        },
        {
          id: "availability",
          heading: "服务可用性",
          paragraphs: [
            "本站为免费服务，我们不承诺不间断可用。维护、升级或不可抗力可能导致临时中断。",
          ],
        },
        {
          id: "liability",
          heading: "责任限制",
          paragraphs: [
            "在法律允许的最大范围内，服务器go 不对因使用本站内容而产生的间接损失、利润损失或数据损失承担责任。",
          ],
        },
        {
          id: "changes",
          heading: "条款变更",
          paragraphs: [
            "我们可能更新本条款，更新后会在本页顶部标注日期。继续使用本站即视为接受更新后的条款。",
          ],
        },
      ],
    },
    en: {
      seoTitle: "Terms of Service - fwqgo",
      description:
        "fwqgo's terms of service: permitted use of our content, the accuracy boundary for prices and stock, intellectual property, prohibited conduct and liability.",
      kicker: "TERMS OF SERVICE",
      heading: "Boundaries first, then usage.",
      intro:
        "By accessing and using fwqgo you accept the terms below. We put the most easily misunderstood points first, including price accuracy, content licensing and liability.",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "accuracy",
          heading: "Prices, stock and promotion terms",
          paragraphs: [
            "Prices, specifications, stock status and coupons shown on this site come from providers' public pages and announcements. We record them at collection time and label the last update.",
            "Provider prices and promotion terms change without notice. The information shown on the provider's checkout page at the time of your order always governs; nothing on this site is a quotation or a promise of purchase.",
          ],
        },
        {
          id: "no-advice",
          heading: "Content is not purchasing advice",
          paragraphs: [
            "Reviews, comparisons and knowledge base articles help you understand concepts and narrow down options. They are not procurement, compliance or security advice for your specific business.",
            "The final decision remains yours, based on your workload, budget, data compliance requirements and the provider's own terms.",
          ],
        },
        {
          id: "ip",
          heading: "Intellectual property",
          paragraphs: [
            "Original articles, page structure and tool interfaces on this site belong to fwqgo. Get permission before republishing, excerpting at length, or using them for training purposes.",
            "Provider trademarks, logos and product names belong to their respective owners and are used here for identification only.",
          ],
        },
        {
          id: "acceptable-use",
          heading: "Prohibited conduct",
          paragraphs: ["To keep the site usable, the following are not allowed:"],
          bullets: [
            "High-frequency scraping that degrades normal access",
            "Circumventing access limits or security controls",
            "Using site content for fraud, misleading promotion or unlawful purposes",
            "Automated bulk form submissions or interference with service operation",
          ],
        },
        {
          id: "availability",
          heading: "Availability",
          paragraphs: [
            "This is a free service and we do not promise uninterrupted availability. Maintenance, upgrades or events beyond our control may cause temporary outages.",
          ],
        },
        {
          id: "liability",
          heading: "Limitation of liability",
          paragraphs: [
            "To the maximum extent permitted by law, fwqgo is not liable for indirect losses, lost profits or lost data arising from your use of this site's content.",
          ],
        },
        {
          id: "changes",
          heading: "Changes to these terms",
          paragraphs: [
            "We may update these terms; the date at the top of this page reflects the latest revision. Continued use of the site means you accept the updated terms.",
          ],
        },
      ],
    },
  },

  // -------------------------------------------------- affiliate-disclosure
  "affiliate-disclosure": {
    zh: {
      seoTitle: "推广与佣金披露 - 服务器go",
      description:
        "服务器go 的推广关系披露：站内哪些链接带推广参数、佣金如何影响（以及如何不影响）收录与排序、以及如何识别推广链接。",
      kicker: "推广与佣金披露",
      heading: "哪些链接会给我们带来收入，说清楚。",
      intro:
        "服务器go 通过部分购买链接的推广佣金维持运营。我们认为这件事必须写在明面上：你点进一个购买链接之前，有权知道我们是否会因此获得收入。",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "what-is-affiliate",
          heading: "什么是推广链接",
          paragraphs: [
            "当你在本站点击购买按钮或部分套餐链接时，地址中会带有一段推广标识。如果你随后在商家处完成购买，商家可能会向我们支付一笔佣金。",
            "这笔佣金由商家支付，不会增加你的支出。你支付的价格与直接访问商家官网下单完全一致。",
          ],
        },
        {
          id: "how-to-identify",
          heading: "如何识别",
          paragraphs: [
            "站内的购买跳转统一经过本站的 /go/ 跳转地址，并在跳转到商家之前完成参数拼接。凡是经由购买按钮离开本站的链接，都应视为可能带有推广关系。",
          ],
        },
        {
          id: "what-it-does-not-affect",
          heading: "佣金不影响什么",
          paragraphs: [
            "这是我们最重要的承诺，也是我们与付费排行榜的区别所在：",
          ],
          bullets: [
            "不影响是否收录：商家是否出现在站内，取决于其套餐是否有公开可核验的信息",
            "不影响排序：比价页的排序依据是地区、价格、线路、库存等可核验字段，不接受付费干预",
            "不影响结论：测评与对比文章的判断基于套餐本身的参数与适用场景",
            "不出售位置：我们不提供付费置顶、付费推荐或付费收录",
          ],
        },
        {
          id: "editorial-independence",
          heading: "编辑独立性",
          paragraphs: [
            "带有推广关系的套餐与不带推广关系的套餐在页面上使用同一套模板、同一套字段和同一套排序规则。如果一篇内容包含推广链接，我们会在页面中标注，而不是让你自己去猜。",
          ],
        },
        {
          id: "questions",
          heading: "有疑问时",
          paragraphs: [
            "如果你发现某处推广关系没有标注，或者认为某条排序受到了商业因素影响，请直接告诉我们。这类反馈我们会优先处理。",
          ],
        },
      ],
    },
    en: {
      seoTitle: "Affiliate Disclosure - fwqgo",
      description:
        "fwqgo's affiliate disclosure: which links carry promotion parameters, how commission does and does not affect listings and ranking, and how to spot a monetised link.",
      kicker: "AFFILIATE DISCLOSURE",
      heading: "Which links earn us money — stated plainly.",
      intro:
        "fwqgo is funded in part by affiliate commission on some purchase links. We believe you should know whether we get paid before you click, not after.",
      updatedAt: UPDATED_AT,
      sections: [
        {
          id: "what-is-affiliate",
          heading: "What an affiliate link is",
          paragraphs: [
            "When you click a purchase button or certain plan links on this site, the destination URL carries a promotion identifier. If you go on to buy from the provider, the provider may pay us a commission.",
            "That commission is paid by the provider and does not increase what you pay. Your price is the same as ordering directly on the provider's site.",
          ],
        },
        {
          id: "how-to-identify",
          heading: "How to identify one",
          paragraphs: [
            "Every purchase jump on this site goes through our own /go/ redirect, which assembles the parameters before forwarding you to the provider. Treat any link that leaves this site via a purchase button as potentially monetised.",
          ],
        },
        {
          id: "what-it-does-not-affect",
          heading: "What commission does not affect",
          paragraphs: [
            "This is our most important commitment, and it is what separates us from a paid ranking table:",
          ],
          bullets: [
            "Not whether you are listed: a provider appears on the site only if its plans have publicly verifiable information",
            "Not ranking: comparison pages order by verifiable fields such as region, price, route and stock, never by payment",
            "Not conclusions: reviews and comparisons judge the plan's own specifications and suitable workloads",
            "Not placement for sale: we do not sell top slots, paid recommendations or paid listings",
          ],
        },
        {
          id: "editorial-independence",
          heading: "Editorial independence",
          paragraphs: [
            "Monetised and non-monetised plans use the same template, the same fields and the same ordering rules. Where a piece contains affiliate links we label it, rather than leaving you to guess.",
          ],
        },
        {
          id: "questions",
          heading: "If something looks wrong",
          paragraphs: [
            "If you spot an undisclosed promotion relationship, or believe commercial pressure shaped an ordering, tell us. We treat this class of feedback as a priority.",
          ],
        },
      ],
    },
  },
};

export function getTrustDocument(
  slug: keyof typeof documents,
  language: PublicLanguage,
): TrustDocument {
  return documents[slug][language];
}

export function listTrustDocuments() {
  return Object.keys(documents) as Array<keyof typeof documents>;
}
