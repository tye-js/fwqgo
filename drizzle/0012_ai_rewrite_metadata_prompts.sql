ALTER TABLE "ai_rewrite_configs" ADD COLUMN IF NOT EXISTS "metadataPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN IF NOT EXISTS "metadataStylePrompt" text;--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "metadataPrompt" = '你是服务器/VPS推广文章的 SEO 编辑。请根据改写后的 HTML 正文生成文章元信息。

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
{htmlContent}'
WHERE "metadataPrompt" IS NULL;--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "metadataStylePrompt" = '标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。'
WHERE "metadataStylePrompt" IS NULL;
