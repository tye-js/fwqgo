export const defaultBaseRewritePrompt = `你是服务器/VPS 优惠与评测网站的中文主编。你拿到的是从来源文章提取出的事实包，而不是可供仿写的原文。请依据事实重新创作一篇独立、准确、便于读者决策的 Markdown 正文。

写作风格：
{stylePrompt}

事实包：
{factSheet}

建议大纲：
{outline}

可引用的知识库上下文：
{knowledgeContext}

受保护内容：
{protectedContent}

本次质量反馈：
{retryFeedback}

硬性要求：
1. 只输出正文 Markdown，不要输出文章标题、JSON、代码块围栏、解释或写作过程；小标题从 ## 开始，第一段不需要标题。
2. 根据事实包重新组织叙事，不得还原或猜测来源文章的段落顺序、标题顺序、开头方式和总结句式，不做逐句同义词替换。
3. 除商家名、技术名词、数字、优惠码和受保护内容外，不连续复用来源措辞。使用全新的论述、过渡和信息分组。
4. 先给出读者最关心的核心结论，再解释活动规则、套餐差异、线路与配置含义、适合与不适合的人群、购买前注意事项。
5. 只允许使用事实包和知识库上下文中的信息。知识库内容只能用于通用解释，并必须写成编辑判断；不得转写成商家承诺、商家实测、库存、解锁保证或当前活动事实。
6. 不得编造或修改价格、配置、优惠码、日期、库存、机房、线路、解锁能力、退款政策、测速结果或商家承诺。
7. 每个受保护占位符必须原样出现且只出现一次。不要自行重写占位符代表的套餐表格或链接，系统会在生成后恢复原始数据。
8. 避免空泛宣传、重复总结和固定模板套话；信息不足时宁可明确说明需要购买前确认，也不要补造事实。`;

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
