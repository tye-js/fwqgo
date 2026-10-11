-- 新增「促销优惠」分类，归档节日大促与限时活动文章。
--
-- 为什么用 `INSERT ... SELECT ... WHERE NOT EXISTS` 而不是 `ON CONFLICT DO NOTHING`：
-- `categories` 上有 `categories_public_slug_history` 触发器（见 0068_public_slug_history.sql），
-- 它在 BEFORE INSERT 时会把新行的 `coalesce(nullif(btrim("enSlug"),''), slug)` 与**其它所有
-- 分类和标签**的同一表达式比对，冲突就 `RAISE EXCEPTION ... ERRCODE 23505`。那是触发器主动
-- 抛错，不是约束冲突，`ON CONFLICT` 接不住。`WHERE NOT EXISTS` 让本迁移可安全重复执行：
-- 已存在时零行插入、零触发器触发。
--
-- 为什么 slug 用 `promotions` 而不是更短的 `promo`：标签表里已存在一个 slug 与 enSlug 都是
-- `promo` 的标签（id=1174），直接复用会撞上上面那条跨表冲突检查。`promotions` 经预检确认
-- 在 categories、tags 与 public_slug_redirects 三处都未被占用。
--
-- 分类没有 `indexable` 字段：是否可索引由 `isPublicCategoryIndexable(已发布篇数 >= 3)` 运行时
-- 计算（packages/core/public-content-policy.ts）。本分类迁入 42 篇，自动达标。
--> statement-breakpoint
INSERT INTO "categories" ("name","slug","enName","enSlug","description","keywords","enDescription","enKeywords")
SELECT
  '促销优惠',
  'promotions',
  'VPS Promotions',
  'promotions',
  '汇总各商家的节日大促与限时活动文章：黑五、双十一、双旦、春节、国庆、中秋、周年庆、开学季与夏季促销等。这类活动的折扣力度通常大于日常价，但有效期普遍较短，价格、库存与续费条款以商家页面为准，下单前请核对活动时间。',
  'VPS活动,VPS促销,黑五,双十一,圣诞,元旦,春节,国庆,中秋,周年庆,开学季,限时优惠',
  'Seasonal sales, festival campaigns and limited-time offers from VPS and server providers, including Black Friday, Double 11, Christmas, New Year, Spring Festival, National Day, Mid-Autumn, anniversaries and back-to-school deals. Discounts are usually deeper than regular pricing but stay open only for the campaign window, so check each provider page for the current price, stock and renewal terms before ordering.',
  'vps promotions,black friday vps,double 11 vps,christmas vps deals,new year vps sale,limited time offer'
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c."name" = '促销优惠'
     OR c."slug" = 'promotions'
     OR c."enSlug" = 'promotions'
);
