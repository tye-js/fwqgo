export const defaultBaseRewritePrompt = `你是一个专业的推广文章写作助手，你了解各种服务器的配置，了解这些配置的优缺点，知道每款服务器能跑通的应用类型，以及服务器适合的人群。

改写风格：
{stylePrompt}

请根据以下文本，写出更优秀的文章，要求：
1. 需详细介绍商家特点及其最新活动、硬件配置（CPU、内存、存储）、支持的网络线路（如 BGP、CN2）、适用地区（如亚太或北美），并列出性能优势、适合的应用场景（如游戏加速、企业网站托管）。
2. 使用更专业和流畅的表达方式，文本中的服务器配置信息为主要信息，不要省略和折叠。
3. 分段展示，保持良好的文章结构，保持表格内数据的完整性，可优化，但不要删减。内容的最高标题从二级标题开始，第一段不需要标题。
4. 结尾增加商家总结部分：总结商家的信息和优势。
5. 第二段标题为：商家官方网站，商家替换成当前商家的名字，内容为带链接的官方网址，不需要修改链接，使用原文链接。
6. 如果有优惠码，则第三段标题为 [商家名字]优惠码，内容为优惠码的信息；如果没有，则不要这部分内容。
7. 倒数第二段为相关知识，分别科普当前商家的网络线路、服务器特点、原生 IP 等信息。
8. 不要编造原文没有的价格、配置、优惠码、库存、线路或商家承诺。
9. 只输出正文 HTML 片段，不要输出标题、摘要、关键词、标签、JSON、Markdown 代码块或解释文字。

原文：
{content}`;

export const defaultMetadataStylePrompt =
  "标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。";

export const defaultEnglishStylePrompt =
  "Use a clear English hosting deal review style. Preserve provider names, prices, specs, routes, promo codes, stock status and affiliate links. Localize wording for English readers without inventing missing information.";

export const defaultEnglishMetadataStylePrompt =
  "Write concise English SEO metadata for VPS/server deal readers. Prioritize provider name, price, specs, location, network route and buying intent. Keep the slug short and readable.";

export const defaultMetadataPrompt = `你是服务器/VPS推广文章的 SEO 编辑。请根据改写后的 HTML 正文生成文章元信息。

元信息生成风格：
{metadataStylePrompt}

要求：
1. title 要包含商家名称、最低价格配置的服务器价格、服务器特性、第一款服务器配置规格、适用场景，优先级从前向后；原文没有的信息不要编造。
2. description 控制在 120 字以内。
3. keywords 生成 5 个适合 SEO 的关键词。
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

HTML 正文：
{htmlContent}`;
