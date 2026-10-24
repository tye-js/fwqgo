-- 文章时间戳改成「绝对时刻」，并修掉已经写偏 8 小时的历史行。
--
-- 背景：posts."createdAt" / "updatedAt" 原本是 timestamp（不带时区），而写入方
-- 不止一类：
--   1. CMS 进程 —— TZ=UTC，postgres.js 用 toISOString() 发送，落库就是 UTC；
--   2. psql / 裸 SQL —— session TimeZone=Asia/Shanghai，`now()` 或北京时间字面量
--      都会被当成墙钟存进来。
-- 展示层把这两列当 UTC 解释、再转成 Asia/Shanghai，第 2 类就又多出 8 小时，
-- 跨零点时文章日期直接跳到「明天」。
--
-- 修法：
--   a) 时间落在未来的行只可能是写偏的，拨回 8 小时；
--   b) 两列换成 timestamptz。psql 的 now()、带 +08 偏移的字面量、JS 的
--      toISOString() 都会落成同一个绝对时刻，不再依赖写入方的时区。
--
-- 幂等：a 的条件只会命中未来行；b 先查 information_schema，已转换则跳过
-- （否则 USING ... AT TIME ZONE 'UTC' 会二次偏移）。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'createdAt'
      AND data_type = 'timestamp without time zone'
  ) THEN
    UPDATE "posts"
    SET "createdAt" = "createdAt" - interval '8 hours'
    WHERE "createdAt" > (now() AT TIME ZONE 'UTC') + interval '1 minute';

    ALTER TABLE "posts"
      ALTER COLUMN "createdAt" TYPE timestamp with time zone
      USING "createdAt" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'updatedAt'
      AND data_type = 'timestamp without time zone'
  ) THEN
    UPDATE "posts"
    SET "updatedAt" = "updatedAt" - interval '8 hours'
    WHERE "updatedAt" > (now() AT TIME ZONE 'UTC') + interval '1 minute';

    ALTER TABLE "posts"
      ALTER COLUMN "updatedAt" TYPE timestamp with time zone
      USING "updatedAt" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "createdAt" SET DEFAULT now();
