export const defaultBaseRewritePrompt = `你是服务器/VPS 文章的中文编辑。请只基于清洗后的来源原文，对正文做小幅度改写和排版整理，输出 Markdown。任务是忠实编辑，不是扩写、补充知识或重新创作。

写作风格：
{stylePrompt}

来源原文（唯一正文依据，表格和链接已替换为受保护占位符）：
{sourceContent}

来源信息摘要（仅用于组织原文，若与原文冲突，以原文为准）：
{factSheet}

来源关键词信息（只用于核对来源主题，不用于新增正文内容）：
{keywordPlan}

正文长度边界：
{rewriteLengthBudget}

来源已有结构提示（只用于排版，不新增主题）：
{outline}

受保护内容：
{protectedContent}

本次质量反馈：
{retryFeedback}

硬性要求：
1. 只输出正文 Markdown，不要输出文章标题、JSON、代码块围栏、解释或写作过程；小标题从 ## 开始，第一段不需要标题。
2. 原文中的主体与对象、运营商名称、肯定或否定、比较关系、适用条件、不确定性和信息归属必须保持不变。不得把电信、联通、移动等对象互换，也不得把推测写成结论。
3. 只做小幅度改写：调整语序、用词、段落层次、列表和小标题，使内容更清楚；不要为了追求差异而扩写或改变篇幅。
4. 只允许使用来源原文、受保护内容和来源信息摘要中可回溯到来源的内容。禁止引用知识库、供应商资料、搜索结果或任何其他外部信息。
5. 不新增基础知识章节、购买建议、市场评价、适用场景、线路分析、性能测试、社区反馈、商家承诺或总结；来源已有的标题和总结可以保留并调整排版。
6. 不得编造或修改价格、配置、优惠码、日期、库存、机房、线路、运营商、解锁能力、退款政策、测速结果、用户反馈或商家承诺。没有明确来源时，不得使用“实测显示”“官方社区反馈”“多位用户反馈”等归因句式。
7. 每个受保护占位符必须原样出现且只出现一次。不要自行重写占位符代表的套餐表格或链接，系统会在生成后恢复原始数据。
8. 不要机械重复关键词，也不要把关键词变成正文新增事实；关键词只用于核对来源主题和生成 SEO 元信息。
9. 正文叙述长度只能接近来源原文，不得超过长度边界；不要用空泛宣传填充篇幅。
10. 正文清洗边界：只保留当前文章主题的正文。不要输出来源站名称、来源网址、转载声明、版权尾注、作者/发布时间等页面元信息，也不要输出非本文内容的相关推荐、相关文章、猜你喜欢、上一篇/下一篇、分享、评论或导航文案。`;

export const defaultFactExtractionPrompt = `你是严格的服务器文章事实抽取器。请从来源 Markdown 中提取一份用于小幅改写和排版整理的事实核对清单，并列出来源已有的主题。

要求：
1. 只输出紧凑 JSON 对象，不要输出 Markdown、解释或额外文本。
2. 所有价格、配置、优惠码、日期、库存、机房、线路、IP、退款和商家承诺必须逐字忠于来源，不得纠错、补全或推断。
3. 每条事实使用完整短句，保留主体与对象、运营商名称、肯定或否定、比较关系、条件、范围、不确定性和信息归属；不得压缩成会丢失关系的关键词。
4. criticalFacts 应覆盖正文中的关键数字和限定条件；套餐表格会由系统原样保护，无需逐行复制到 productGroups，但不能遗漏最低价格、主要配置组和付款周期。
5. supportedUseCases 只能收录来源明确说明的场景；cautions 只能收录来源已有的限制、未知项或明确提醒，不得加入编辑推断。
6. outline 只输出来源中已有的中文主题或标题。短文可以少于 2 个，不得为了凑结构增加线路分析、适用场景、实测、社区反馈、优缺点或无依据总结。
7. 同时生成 SEO 关键词规划。每个关键词必须附带 1 到 4 条可在来源 Markdown、来源标题或分类信息中逐字定位的短证据。
8. provenance 只能是 body、table、title 或 taxonomy。taxonomy 只能帮助分类和检索，不能支持正文事实。
9. primaryKeyword 最多 1 个，secondaryKeywords 最多 4 个，longTailKeywords 最多 3 个。不得加入来源没有的地区、线路、性能、用途或“高性价比、稳定、低延迟、最便宜、推荐”等评价。

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
  "outline": ["全新小标题"],
  "seoKeywordPlan": {
    "primaryKeyword": {"keyword":"主关键词","evidence":[{"text":"来源逐字证据","provenance":"body"}]},
    "secondaryKeywords": [{"keyword":"次要关键词","evidence":[{"text":"来源逐字证据","provenance":"table"}]}],
    "longTailKeywords": [{"keyword":"长尾关键词","evidence":[{"text":"来源逐字证据","provenance":"title"}]}],
    "searchIntent": "transactional | informational | mixed"
  }
}

来源标题和分类上下文（分类只能用于 taxonomy 证据）：
{sourceContext}

来源 Markdown：
{sourceMarkdown}`;

export const defaultInitialRewriteFeedbackPrompt =
  "首次生成，没有上一轮反馈。请直接按正文模板输出。";

const sourceOnlyRewriteSupplement = `

本次改写模式：只允许使用清洗后的来源原文和受保护原始内容。只做小幅度改写与排版整理，不引用知识库、供应商资料或其他外部信息，不新增基础知识章节、市场评价、用途建议、性能结论或总结；不要因为正文与来源相似而判定失败。`;

const sourceContentBoundarySupplement = `

正文清洗边界：只保留当前文章主题的正文。来源站名称、来源网址、转载声明、版权尾注、作者/发布时间等页面元信息，以及非本文内容的相关推荐、相关文章、猜你喜欢、上一篇/下一篇、分享、评论或导航文案，都必须删除，不得改写后重新放回正文。`;

export type SourceAnchoredRewritePromptInput = {
  configuredPrompt?: string | null;
  stylePrompt: string;
  sourceContent: string;
  factSheet: string;
  keywordPlan: string;
  rewriteLengthBudget: string;
  outline: string;
  providerContext: string;
  knowledgeContext: string;
  knowledgeSections?: string;
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
    custom.includes("{protectedContent}")
  ) {
    let resolved = custom;
    if (!custom.includes("正文清洗边界")) {
      resolved += sourceContentBoundarySupplement;
    }
    if (!custom.includes("本次改写模式")) {
      resolved += sourceOnlyRewriteSupplement;
    }
    return resolved;
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
    keywordPlan: "仅用于来源主题核对和 SEO 元信息，不用于新增正文内容。",
    rewriteLengthBudget: input.rewriteLengthBudget,
    outline: "仅整理来源已有结构，不新增主题。",
    providerContext:
      "本次改写不使用供应商资料，只依据清洗后的来源原文。",
    knowledgeContext:
      "本次改写不使用知识库，只依据清洗后的来源原文。",
    knowledgeSections: "本次改写不添加来源之外的基础知识章节。",
    protectedContent: input.protectedContent,
    retryFeedback: input.retryFeedback,
  };

  const prompt = interpolatePromptTemplate(template, values);
  const sourceOnlyPrompt = template.includes("本次改写模式")
    ? prompt
    : `${prompt}\n${sourceOnlyRewriteSupplement}`;
  const supplements = [
    !template.includes("{rewriteLengthBudget}")
      ? `正文长度边界（硬约束）：\n${input.rewriteLengthBudget}`
      : "",
    !template.includes("{retryFeedback}")
      ? `本轮正文完整性要求：\n${input.retryFeedback}`
      : "",
  ].filter(Boolean);

  return supplements.length > 0
    ? `${sourceOnlyPrompt}\n\n${supplements.join("\n\n")}`
    : sourceOnlyPrompt;
}

export const defaultMetadataStylePrompt =
  "标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。";

export const defaultEnglishStylePrompt =
  "Use a clear English hosting deal review style. Preserve provider names, prices, specs, routes, promo codes, stock status and affiliate links. Localize wording for English readers without inventing missing information.";

export const defaultEnglishMetadataStylePrompt =
  "Write concise English SEO metadata for VPS/server deal readers. Prioritize provider name, price, specs, location, network route and buying intent. Keep the slug short and readable.";

export const defaultMetadataPrompt = `你是服务器/VPS推广文章的 SEO 编辑。请根据已完成单次改写的 Markdown 正文生成文章元信息。

元信息生成风格：
{metadataStylePrompt}

根据来源原文生成的关键词规划：
{keywordPlan}

要求：
1. title 要包含商家名称、最低价格配置的服务器价格、服务器特性、第一款服务器配置规格、适用场景，优先级从前向后；原文没有的信息不要编造。
2. description 控制在 120 字以内。
3. keywords 生成 2 到 6 个适合 SEO 的关键词，不要超过 6 个；优先从关键词规划中选择，并确保最终正文确实覆盖或原文证据明确支持。
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
