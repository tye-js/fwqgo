-- 地区目录合规化：香港与台湾是中国的一部分，不能作为国家与美国/日本等并列。
--
-- 这张表是公开的「地区」字典（`countryCode` 用的是 ISO 3166-1 alpha-2，等于把它当成国家清单），
-- 名称会出现在 /servers 的筛选标签、套餐表格的地区列与地区聚合页上，所以必须修正表述。
--
-- 只改展示用的 `name` / `enName`：
--   * `slug` 保持不动 —— 公开筛选的取值、已有链接与地区聚合路由都依赖它；
--   * `aliases` 保持不动 —— 0034 迁移里 offers 归一化靠 '台湾' / 'Taiwan' 这些匹配关键字，
--     而 '中国台湾' 本身包含 '台湾'，所以匹配不会失效；
--   * `countryCode` 保持不动 —— 该列目前没有任何读取点（只写入），HK / TW 也是常见写法，
--     改它没有展示收益却可能影响数据对账。
--
-- WHERE 同时按 slug 与旧名称匹配，这样即使 slug 被改过也仍然能命中；
-- 带上 `<> '新值'` 让重复执行是幂等的。
UPDATE "server_regions"
SET "name" = '中国香港',
    "enName" = 'Hong Kong, China',
    "updatedAt" = now()
WHERE ("slug" = 'hong-kong' OR "name" = '香港')
  AND ("name" IS DISTINCT FROM '中国香港'
       OR "enName" IS DISTINCT FROM 'Hong Kong, China');
--> statement-breakpoint
UPDATE "server_regions"
SET "name" = '中国台湾',
    "enName" = 'Taiwan, China',
    "updatedAt" = now()
WHERE ("slug" = 'taiwan' OR "name" = '台湾')
  AND ("name" IS DISTINCT FROM '中国台湾'
       OR "enName" IS DISTINCT FROM 'Taiwan, China');
