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

function resolveSourceAnchoredRewriteTemplate(value?: string | null) {
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

function appendMissingPromptContext(
  template: string,
  markers: string[],
  heading: string,
  placeholder: string,
) {
  return markers.some((marker) => template.includes(marker))
    ? template
    : `${template}\n\n${heading}：\n${placeholder}`;
}

export function buildSourceAnchoredRewritePrompt(
  input: SourceAnchoredRewritePromptInput,
) {
  let template = resolveSourceAnchoredRewriteTemplate(input.configuredPrompt);
  template = appendMissingPromptContext(
    template,
    ["{sourceContent}", "{content}"],
    "来源原文（事实最高优先级）",
    "{sourceContent}",
  );
  template = appendMissingPromptContext(
    template,
    ["{providerContext}"],
    "供应商官网资料",
    "{providerContext}",
  );
  template = appendMissingPromptContext(
    template,
    ["{knowledgeContext}"],
    "可引用的知识库上下文",
    "{knowledgeContext}",
  );

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

  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{${key}}`, value);
  }

  return template;
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
