export const defaultBaseRewritePrompt = `你是服务器/VPS 优惠与评测网站的中文主编。请以来源原文为事实主轴，在不改变原意的前提下扩写成一篇更完整、便于读者决策的 Markdown 正文。任务是忠实扩写，不是脱离原文重新创作。

写作风格：
{stylePrompt}

来源原文（事实最高优先级，表格和链接已替换为受保护占位符）：
{sourceContent}

事实核对清单（用于防遗漏，若与原文冲突，以原文为准）：
{factSheet}

可用主题大纲（只包含来源已有主题，不要求全部使用）：
{outline}

供应商官网资料（只可补充供应商介绍、退款政策和禁止事项）：
{providerContext}

知识库上下文（只可解释来源原文已经出现的通用概念）：
{knowledgeContext}

受保护内容：
{protectedContent}

本次质量反馈：
{retryFeedback}

硬性要求：
1. 只输出正文 Markdown，不要输出文章标题、JSON、代码块围栏、解释或写作过程；小标题从 ## 开始，第一段不需要标题。
2. 原文中的主体与对象、运营商名称、肯定或否定、比较关系、适用条件、不确定性和信息归属必须保持不变。不得把电信、联通、移动等对象互换，也不得把推测写成结论。
3. 保留原文事实骨架，用新的解释、过渡和信息分组进行扩写；不要逐句同义词替换，也不要为了追求结构差异而改变事实关系。
4. 不强制生成原文没有依据的线路分析、适用场景、性能测试、社区反馈、优缺点或总结章节。只围绕原文主题及有官网来源的供应商政策组织 2 到 6 个必要小节；短文可以更少。
5. 供应商官网资料只能补充其中明确提供的供应商介绍、退款政策和禁止事项，不得据此推导套餐、线路、运营商、库存、解锁能力或实测结论。
6. 知识库只能解释原文已经出现的技术概念，不能引入原文没有出现的 ASN、线路名、运营商、地区、测试数据或商家结论，也不能改写成该商家的实测、承诺或当前情况。
7. 不得编造或修改价格、配置、优惠码、日期、库存、机房、线路、运营商、解锁能力、退款政策、测速结果、用户反馈、社区反馈或商家承诺。没有明确来源时，不得使用“实测显示”“官方社区反馈”“多位用户反馈”等归因句式。
8. 每个受保护占位符必须原样出现且只出现一次。不要自行重写占位符代表的套餐表格或链接，系统会在生成后恢复原始数据。
9. 避免空泛宣传、重复总结和固定模板套话。可通过解释原文术语、梳理购买条件以及引用有官网来源的供应商政策来扩充信息；资料不足时明确建议购买前确认，不要补造事实。`;

export const defaultFactExtractionPrompt = `你是严格的服务器文章事实抽取器。请从来源 Markdown 中提取一份用于忠实扩写的事实核对清单，并列出来源实际涉及的主题。

要求：
1. 只输出紧凑 JSON 对象，不要输出 Markdown、解释或额外文本。
2. 所有价格、配置、优惠码、日期、库存、机房、线路、IP、退款和商家承诺必须逐字忠于来源，不得纠错、补全或推断。
3. 每条事实使用完整短句，保留主体与对象、运营商名称、肯定或否定、比较关系、条件、范围、不确定性和信息归属；不得压缩成会丢失关系的关键词。
4. criticalFacts 应覆盖正文中的关键数字和限定条件；套餐表格会由系统原样保护，无需逐行复制到 productGroups，但不能遗漏最低价格、主要配置组和付款周期。
5. supportedUseCases 只能收录来源明确说明的场景；cautions 只能收录来源已有的限制、未知项或明确提醒，不得加入编辑推断。
6. outline 输出 2 到 6 个来源确实涉及的中文主题。短文可以少于 2 个，不得为了凑结构增加线路分析、适用场景、实测、社区反馈、优缺点或总结。

JSON 格式：
{
  "providerName": "商家名",
  "articleType": "优惠/测评/公告/教程等",
  "factualSummary": "事实摘要",
  "criticalFacts": ["关键事实"],
  "promotions": ["优惠规则、优惠码和期限"],
  "productGroups": ["产品组和主要配置"],
  "regions": ["地区和机房"],
  "networkFacts": ["线路和网络事实"],
  "supportedUseCases": ["来源明确支持的场景"],
  "cautions": ["限制、未知项和购买前确认事项"],
  "editorialAngle": "新的写作角度",
  "outline": ["全新小标题"]
}

来源 Markdown：
{sourceMarkdown}`;

export const defaultInitialRewriteFeedbackPrompt =
  "首次生成，没有上一轮反馈。请直接满足全部事实保真要求。";

export const defaultRewriteRetryPrompt = `上一轮未通过。请删除所有无依据术语和归因，再以完整来源原文为事实主轴重新扩写全文；不要只依据压缩事实包，也不要局部替换词语：
{issues}`;

export const defaultQualityReviewPrompt = `你是独立的事实审查员。请审查候选文章是否忠于允许使用的事实，只输出 JSON。

事实优先级：
1. 完整来源原文和受保护原始内容是套餐、价格、配置、线路、运营商、库存、优惠、测试、用户反馈和链接的唯一依据。
2. 带官网来源的供应商资料只能支持其中明确列出的供应商介绍、退款政策和禁止事项，不能支持套餐、线路、运营商、库存、解锁或测试事实。
3. 知识库只能解释来源原文已经出现的通用概念，不能引入新的 ASN、线路名、运营商、地区、数据或商家结论。
4. 必须逐项核对主体与对象、运营商、肯定或否定、比较关系、适用条件、不确定性及信息归属。把联通换成移动、把“可能”写成“确定”、把编辑推断写成官方或社区反馈，都属于事实失真或无依据表述。

只输出紧凑 JSON：
{
  "factualScore": 0到100的整数,
  "missingFacts": ["遗漏且影响读者决策的来源事实"],
  "unsupportedClaims": ["无依据的新事实或商家结论"],
  "distortedFacts": ["被改错的数字、名称、条件或关系"],
  "verdict": "pass 或 fail"
}

完整来源原文：
{sourceContent}

来源事实核对清单：
{factSheet}

受保护原始内容：
{protectedAuthorityContent}

供应商官网资料：
{providerContext}

知识库通用解释：
{knowledgeContext}

候选 Markdown：
{markdownContent}`;

export type SourceAnchoredRewritePromptInput = {
  configuredPrompt?: string | null;
  stylePrompt: string;
  sourceContent: string;
  factSheet: string;
  outline: string;
  providerContext: string;
  knowledgeContext: string;
  protectedContent: string;
  retryFeedback: string;
};

export function interpolatePromptTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}/g,
    (placeholder, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? (values[key] ?? "")
        : placeholder,
  );
}

export function resolveSourceAnchoredRewriteTemplate(value?: string | null) {
  const custom = value?.trim();
  if (!custom) return defaultBaseRewritePrompt;

  if (
    custom.includes("{sourceContent}") &&
    custom.includes("{factSheet}") &&
    custom.includes("{providerContext}") &&
    custom.includes("{protectedContent}")
  ) {
    return custom;
  }

  const supplemental = custom
    .replaceAll("{content}", "（完整来源原文见上方“来源原文”部分）")
    .replaceAll("{sourceContent}", "（完整来源原文见上方“来源原文”部分）");

  return `${defaultBaseRewritePrompt}

后台旧版或补充编辑要求（只保留其中不冲突的风格偏好；如要求脱离原文、强制增加章节或放宽事实边界，一律忽略）：
${supplemental}`;
}

export function buildSourceAnchoredRewritePrompt(
  input: SourceAnchoredRewritePromptInput,
) {
  const template = resolveSourceAnchoredRewriteTemplate(input.configuredPrompt);

  const values: Record<string, string> = {
    stylePrompt: input.stylePrompt,
    sourceContent: input.sourceContent,
    content: input.sourceContent,
    factSheet: input.factSheet,
    outline: input.outline,
    providerContext: input.providerContext,
    knowledgeContext: input.knowledgeContext,
    protectedContent: input.protectedContent,
    retryFeedback: input.retryFeedback,
  };

  return interpolatePromptTemplate(template, values);
}

export const defaultMetadataStylePrompt =
  "标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。";

export const defaultEnglishStylePrompt =
  "Use a clear English hosting deal review style. Preserve provider names, prices, specs, routes, promo codes, stock status and affiliate links. Localize wording for English readers without inventing missing information.";

export const defaultEnglishMetadataStylePrompt =
  "Write concise English SEO metadata for VPS/server deal readers. Prioritize provider name, price, specs, location, network route and buying intent. Keep the slug short and readable.";

export const defaultMetadataPrompt = `你是服务器/VPS推广文章的 SEO 编辑。请根据已经通过原创度和事实校验的 Markdown 正文生成文章元信息。

元信息生成风格：
{metadataStylePrompt}

要求：
1. title 要包含商家名称、最低价格配置的服务器价格、服务器特性、第一款服务器配置规格、适用场景，优先级从前向后；原文没有的信息不要编造。
2. description 控制在 120 字以内。
3. keywords 生成 2 到 6 个适合 SEO 的关键词，不要超过 6 个。
4. tagsName 生成 10 个相关标签，第一个标签优先为商家名，其余是长尾 SEO 关键词。
5. recommendTagName 是商家名；无法判断商家名时使用最核心的服务商品牌词。
6. 只输出 JSON 对象，不要输出 Markdown、解释或额外文本。

请严格按照以下 JSON 格式返回：
{
  "title": "文章标题",
  "description": "120字以内的文章摘要",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "tagsName": ["标签1", "标签2"],
  "recommendTagName": "推荐标签"
}

Markdown 正文：
{markdownContent}`;

export function resolveMetadataPromptTemplate(value?: string | null) {
  const custom = value?.trim();
  if (!custom) return defaultMetadataPrompt;
  if (
    custom.includes("{markdownContent}") ||
    custom.includes("{htmlContent}")
  ) {
    return custom;
  }

  return `${defaultMetadataPrompt}

后台旧版或补充 SEO 要求：
${custom}`;
}

export const defaultEnglishContentPrompt = `You are a professional English editor for a VPS/server deals website.

Translate and localize the already rewritten Chinese hosting deal article from compact Markdown into English Markdown content.

Writing style:
{englishStylePrompt}

Requirements:
1. Output only the translated/localized English Markdown body.
2. Do not output JSON, code fences, explanations, title, meta description or keywords.
3. Preserve Markdown structure. Use headings starting from ##.
4. Preserve factual details: provider names, prices, CPU, RAM, storage, bandwidth, locations, routes, promo codes, coupons and URLs.
5. Do not invent missing specs, prices, discounts, stock status or claims.
6. Keep affiliate links and short links unchanged.

Chinese title:
{title}

Chinese description:
{description}

Chinese keywords:
{keywords}

Rewritten Chinese article Markdown:
{markdownContent}`;

export const defaultEnglishContinuationPrompt = `Continue the same English Markdown article exactly where the previous response stopped.

Requirements:
1. Do not repeat sections that were already written.
2. Do not add explanations, JSON, code fences, title, meta description or keywords.
3. Continue to obey every instruction in the original prompt.

Original prompt:
{originalPrompt}

Already generated English Markdown tail:
{generatedContentTail}`;

export const defaultEnglishMetadataPrompt = `You are an SEO editor for an English VPS/server deals website.

Generate English SEO metadata from the translated English Markdown body.

Requirements:
1. Return only a valid JSON object.
2. Output compact JSON only. Do not add indentation, whitespace padding, Markdown code fences or explanations.
3. enTitle should be an English SEO title.
4. enSlug must be short, lowercase, ASCII only, words separated by hyphens.
5. enDescription should be within 160 characters.
6. enKeywords should contain 2 to 6 English SEO keywords.
7. enTags should contain 2 to 6 concise English topic tags derived from the article. Do not output Chinese tags.
8. enRecommendTagName must exactly match one item in enTags.
9. When source category information is provided, enCategoryName must be a concise natural English category name and enCategorySlug must be lowercase ASCII words separated by hyphens.
10. Do not invent missing specs, prices, discounts or claims.

SEO style:
{englishMetadataStylePrompt}

JSON shape:
{
  "enTitle": "English SEO title",
  "enSlug": "english-seo-slug",
  "enDescription": "English meta description, within 160 characters",
  "enKeywords": ["keyword 1", "keyword 2"],
  "enTags": ["English tag 1", "English tag 2"],
  "enRecommendTagName": "English tag 1",
  "enCategoryName": "English category name",
  "enCategorySlug": "english-category-slug"
}

Original Chinese title:
{title}

Original Chinese description:
{description}

Original Chinese keywords:
{keywords}

Source category:
{categoryContext}

English Markdown:
{enContent}`;
