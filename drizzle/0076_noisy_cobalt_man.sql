-- 生图比例改为 5:2：正文首图与封面共用同一张图，横版 5:2（1500x600）。
--
-- 只改默认值不会影响已存在的生图配置：它们仍留着 16:9 的尺寸和
-- 「横版 16:9」的模板文案，模型会按模板构图，出图比例和实际用途继续对不上。
-- 因此这里把历史配置一起归一到 5:2。
--
-- 两条 UPDATE 都是幂等的：改过的行不再匹配条件，重复执行零影响。
--> statement-breakpoint
ALTER TABLE "image_generation_configs" ALTER COLUMN "size" SET DEFAULT '1500x600';
--> statement-breakpoint
UPDATE "image_generation_configs"
SET "size" = '1500x600'
WHERE "size" = '1024x576';
--> statement-breakpoint
UPDATE "image_generation_configs"
SET "promptTemplate" = replace("promptTemplate", '横版 16:9', '横版 5:2（宽:高 = 5:2）')
WHERE "promptTemplate" LIKE '%16:9%';
