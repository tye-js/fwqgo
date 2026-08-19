UPDATE "ai_rewrite_configs"
SET "basePrompt" = replace(replace(replace(replace(replace(coalesce("basePrompt", $prompt$你是服务器/VPS 文章的中文编辑。请直接基于来源原文做小幅改写和排版整理，输出 Markdown。

写作风格：
{stylePrompt}

来源原文：
{sourceContent}

正文长度边界：
{rewriteLengthBudget}

受保护内容：
{protectedContent}

只输出正文 Markdown；保留价格、配置、优惠码、链接和受保护占位符；不要引入来源之外的信息。$prompt$), '{stylePrompt}', coalesce("stylePrompt", '')), '{factSheet}', '已取消独立事实提取，请直接以来源原文为依据。'), '{keywordPlan}', '不再单独生成关键词规划。'), '{outline}', '沿用来源原文已有结构，不新增主题。'), '{retryFeedback}', '本次固定生成一次，请直接完成正文改写。')
WHERE "basePrompt" IS NOT NULL
   OR "stylePrompt" <> '保持服务器/VPS文章的专业评测风格，只对原文做小幅改写和排版整理。保留原文中的表格、价格、配置、优惠码、官网链接和返利链接，不新增外部信息。';--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "metadataPrompt" = replace(replace(coalesce("metadataPrompt", $prompt$你是服务器/VPS 推广文章的 SEO 编辑。

元信息风格：
{metadataStylePrompt}

请直接根据 Markdown 正文生成 title、description、keywords、tagsName 和 recommendTagName，只输出 JSON 对象。

Markdown 正文：
{markdownContent}$prompt$), '{metadataStylePrompt}', coalesce("metadataStylePrompt", '标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。')), '{keywordPlan}', '不再单独生成关键词规划，请直接依据正文生成。')
WHERE "metadataPrompt" IS NOT NULL
   OR "metadataStylePrompt" <> '标题要偏 SEO 长尾词，摘要要准确概括商家、价格、配置、线路和适用场景。关键词和标签服务于搜索流量，不要影响正文写作风格。';--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "englishContentPrompt" = replace(coalesce("englishContentPrompt", $prompt$Translate and localize the rewritten Chinese VPS/server article into English Markdown.

Writing style:
{englishStylePrompt}

Preserve provider names, prices, specs, promo codes and links. Output only the English Markdown body.

Chinese title: {title}
Chinese description: {description}
Chinese keywords: {keywords}

Chinese Markdown:
{markdownContent}$prompt$), '{englishStylePrompt}', coalesce("englishStylePrompt", 'Use a clear English hosting deal review style. Preserve provider names, prices, specs, routes, promo codes, stock status and affiliate links. Localize wording for English readers without inventing missing information.'))
WHERE "englishContentPrompt" IS NOT NULL
   OR "englishStylePrompt" <> 'Use a clear English hosting deal review style. Preserve provider names, prices, specs, routes, promo codes, stock status and affiliate links. Localize wording for English readers without inventing missing information.';--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "englishMetadataPrompt" = replace(coalesce("englishMetadataPrompt", $prompt$Generate English SEO metadata for a VPS/server article.

SEO style:
{englishMetadataStylePrompt}

Return only JSON with enTitle, enSlug, enDescription, enKeywords, enTags, enRecommendTagName, enCategoryName and enCategorySlug.

Chinese title: {title}
Chinese description: {description}
Chinese keywords: {keywords}
Source category: {categoryContext}

English Markdown:
{enContent}$prompt$), '{englishMetadataStylePrompt}', coalesce("englishMetadataStylePrompt", 'Write concise English SEO metadata for VPS/server deal readers. Prioritize provider name, price, specs, location, network route and buying intent. Keep the slug short and readable.'))
WHERE "englishMetadataPrompt" IS NOT NULL
   OR "englishMetadataStylePrompt" <> 'Write concise English SEO metadata for VPS/server deal readers. Prioritize provider name, price, specs, location, network route and buying intent. Keep the slug short and readable.';
--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "factExtractionPrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "stylePrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "metadataStylePrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "englishStylePrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "englishMetadataStylePrompt";
