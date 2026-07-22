import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const databaseUrl = process.env.DATABASE_URL ?? process.env.READ_DATABASE_URL;

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    CMS_DATABASE_URL: z.string().url().optional(),
    READ_DATABASE_URL: z.string().url().optional(),
    ANALYTICS_DATABASE_URL: z.string().url().optional(),
    CMS_USERNAME: z.string().min(1).optional(),
    READ_USERNAME: z.string().min(1).optional(),
    CMS_PASSWORD: z.string().min(1).optional(),
    READ_PASSWORD: z.string().min(1).optional(),
    WEB_REVALIDATION_SECRET: z.string().min(16).optional(),
    WEB_REVALIDATION_URL: z.string().url().optional(),
    SECRET_ENCRYPTION_KEYS: z.string().min(1).optional(),
    SECRET_ENCRYPTION_KEY: z.string().min(1).optional(),
    SECRET_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1).optional(),
    ENABLE_CMS_BACKGROUND_WORKERS: z.enum(["true", "false"]).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: databaseUrl,
    CMS_DATABASE_URL: process.env.CMS_DATABASE_URL,
    READ_DATABASE_URL: process.env.READ_DATABASE_URL,
    ANALYTICS_DATABASE_URL: process.env.ANALYTICS_DATABASE_URL,
    CMS_USERNAME: process.env.CMS_USERNAME,
    READ_USERNAME: process.env.READ_USERNAME,
    CMS_PASSWORD: process.env.CMS_PASSWORD,
    READ_PASSWORD: process.env.READ_PASSWORD,
    WEB_REVALIDATION_SECRET: process.env.WEB_REVALIDATION_SECRET,
    WEB_REVALIDATION_URL: process.env.WEB_REVALIDATION_URL,
    SECRET_ENCRYPTION_KEYS: process.env.SECRET_ENCRYPTION_KEYS,
    SECRET_ENCRYPTION_KEY: process.env.SECRET_ENCRYPTION_KEY,
    SECRET_ENCRYPTION_ACTIVE_KEY_ID:
      process.env.SECRET_ENCRYPTION_ACTIVE_KEY_ID,
    ENABLE_CMS_BACKGROUND_WORKERS: process.env.ENABLE_CMS_BACKGROUND_WORKERS,
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
