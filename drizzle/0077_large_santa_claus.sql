-- 生图从「封面」改为「媒体图」：同一张 5:2 图用于社交分享与正文首图。
--
-- 分享图会被平台二次压缩，1500x600 在高分屏和微信/Twitter 卡片上都偏软，
-- 统一提到 2000x800（仍是 5:2）。只改默认值不够——已有配置还留着旧尺寸，
-- 所以把历史配置一起归一。
--
-- 幂等：改过的行不再匹配条件，重复执行零影响。
--> statement-breakpoint
ALTER TABLE "image_generation_configs" ALTER COLUMN "size" SET DEFAULT '2000x800';
--> statement-breakpoint
UPDATE "image_generation_configs"
SET "size" = '2000x800'
WHERE "size" = '1500x600';
