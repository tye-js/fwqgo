import { existsSync, readFileSync } from "node:fs";

import { and, desc, eq, isNull, ne, or } from "drizzle-orm";

import {
  htmlToArticleMarkdown,
  looksLikeHtmlContent,
} from "@fwqgo/core/content";
import { slugify } from "@fwqgo/core/utils";
import type * as AiModule from "@fwqgo/ai/article-rewriter";
import type * as DbModule from "@fwqgo/db";
import type * as SchemaModule from "@fwqgo/db/schema";
import type * as LinkModule from "@/server/links/outbound-short-link";

const DEFAULT_LIMIT = 10;
const MAX_MARKDOWN_LENGTH = 14_000;

type Db = typeof DbModule.db;
type PostsTable = typeof SchemaModule.posts;
type GenerateEnglishArticleContent =
  typeof AiModule.generateEnglishArticleContent;
type GenerateEnglishMetadata = typeof AiModule.generateEnglishMetadata;
type ShortenMarkdownOutboundLinks = typeof LinkModule.shortenMarkdownOutboundLinks;

type RuntimeDeps = {
  db: Db;
  posts: PostsTable;
  generateEnglishArticleContent: GenerateEnglishArticleContent;
  generateEnglishMetadata: GenerateEnglishMetadata;
  shortenMarkdownOutboundLinks: ShortenMarkdownOutboundLinks;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readPositiveInt(name: string, fallback?: number) {
  const value = readArg(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function getUniqueEnglishSlug(baseSlug: string, postId: number) {
  const { db, posts } = await getRuntimeDeps();
  const normalizedBaseSlug = slugify(baseSlug) || "server-deal";

  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${index + 1}`;
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.enSlug, candidate), ne(posts.id, postId)))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return `${normalizedBaseSlug}-${postId}`;
}

async function normalizePostContentToMarkdown(content: string) {
  const { shortenMarkdownOutboundLinks } = await getRuntimeDeps();
  const trimmed = content.trim();
  if (!trimmed || !looksLikeHtmlContent(trimmed)) {
    return { content: trimmed, converted: false, truncated: false };
  }

  const markdown = htmlToArticleMarkdown(trimmed, {
    maxLength: Number.POSITIVE_INFINITY,
  });
  const contentWithShortLinks = await shortenMarkdownOutboundLinks(
    markdown.markdown,
  );

  return {
    content: contentWithShortLinks,
    converted: contentWithShortLinks !== content,
    truncated: markdown.truncated,
  };
}

async function generateEnglishForPost(input: {
  id: number;
  title: string;
  description: string | null;
  keywords: string | null;
  content: string;
  styleId?: number;
}) {
  const {
    generateEnglishArticleContent,
    generateEnglishMetadata,
    shortenMarkdownOutboundLinks,
  } = await getRuntimeDeps();
  const markdownInput = looksLikeHtmlContent(input.content)
    ? htmlToArticleMarkdown(input.content, { maxLength: MAX_MARKDOWN_LENGTH })
    : {
        markdown: input.content.slice(0, MAX_MARKDOWN_LENGTH),
        truncated: input.content.length > MAX_MARKDOWN_LENGTH,
      };

  const englishContent = await generateEnglishArticleContent(
    {
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      markdownContent: markdownInput.markdown,
    },
    { styleId: input.styleId },
  );
  const enContent = await shortenMarkdownOutboundLinks(englishContent);
  const metadata = await generateEnglishMetadata(
    {
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      enContent,
    },
    { styleId: input.styleId },
  );
  const enSlug = await getUniqueEnglishSlug(metadata.enSlug, input.id);

  return {
    ...metadata,
    enSlug,
    enContent,
    inputLength: markdownInput.markdown.length,
    inputTruncated: markdownInput.truncated,
  };
}

function readConfig() {
  const limit = readPositiveInt("limit", DEFAULT_LIMIT) ?? DEFAULT_LIMIT;
  const postId = readPositiveInt("post-id");
  const styleId = readPositiveInt("style-id");
  const write = hasFlag("write");
  const convertOnly = hasFlag("convert-only");
  const englishOnly = hasFlag("english-only");
  const forceEnglish = hasFlag("force-english");

  if (convertOnly && englishOnly) {
    throw new Error("--convert-only 和 --english-only 不能同时使用");
  }

  return {
    write,
    limit,
    postId,
    styleId,
    convertMarkdown: !englishOnly,
    generateEnglish: !convertOnly,
    forceEnglish,
  };
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }

  const index = trimmed.indexOf("=");
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? { key, value } : null;
}

function loadEnvFiles() {
  for (const fileName of [".env.development", ".env.local", ".env"]) {
    if (!existsSync(fileName)) {
      continue;
    }

    const content = readFileSync(fileName, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed || process.env[parsed.key]) {
        continue;
      }

      process.env[parsed.key] = parsed.value;
    }
  }
}

let runtimeDeps: RuntimeDeps | null = null;

async function getRuntimeDeps() {
  if (runtimeDeps) {
    return runtimeDeps;
  }

  loadEnvFiles();
  const [{ db }, { posts }, ai, links] = await Promise.all([
    import("@fwqgo/db"),
    import("@fwqgo/db/schema"),
    import("@fwqgo/ai/article-rewriter"),
    import("@/server/links/outbound-short-link"),
  ]);

  runtimeDeps = {
    db,
    posts,
    generateEnglishArticleContent: ai.generateEnglishArticleContent,
    generateEnglishMetadata: ai.generateEnglishMetadata,
    shortenMarkdownOutboundLinks: links.shortenMarkdownOutboundLinks,
  };

  return runtimeDeps;
}

async function main() {
  const config = readConfig();
  const { db, posts } = await getRuntimeDeps();
  const conditions = [];

  if (config.postId) {
    conditions.push(eq(posts.id, config.postId));
  }

  if (config.generateEnglish && !config.forceEnglish) {
    conditions.push(or(isNull(posts.enContent), eq(posts.enContent, "")));
  }

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      description: posts.description,
      keywords: posts.keywords,
      content: posts.content,
      enTitle: posts.enTitle,
      enSlug: posts.enSlug,
      enDescription: posts.enDescription,
      enKeywords: posts.enKeywords,
      enContent: posts.enContent,
    })
    .from(posts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(config.limit);

  console.log(
    `${config.write ? "WRITE" : "DRY RUN"}: loaded ${rows.length} posts, limit=${config.limit}`,
  );

  let convertedZh = 0;
  let convertedEn = 0;
  let generatedEn = 0;
  let skippedEn = 0;
  let failedEn = 0;

  for (const post of rows) {
    let currentContent = post.content;
    const updateValues: Partial<typeof posts.$inferInsert> = {};

    if (config.convertMarkdown) {
      const zh = await normalizePostContentToMarkdown(post.content);
      if (zh.converted) {
        convertedZh += 1;
        currentContent = zh.content;
        updateValues.content = zh.content;
        console.log(`convert zh #${post.id}: ${post.title}`);
      }

      if (post.enContent) {
        const en = await normalizePostContentToMarkdown(post.enContent);
        if (en.converted) {
          convertedEn += 1;
          updateValues.enContent = en.content;
          console.log(`convert en #${post.id}: ${post.enTitle ?? post.title}`);
        }
      }
    }

    const shouldGenerateEnglish =
      config.generateEnglish &&
      (config.forceEnglish || !post.enContent || post.enContent.trim() === "");

    if (shouldGenerateEnglish) {
      if (!config.write) {
        skippedEn += 1;
        console.log(`would_generate_en #${post.id}: ${post.title}`);
      } else {
        try {
          console.log(`generate_en start #${post.id}: ${post.title}`);
          const english = await generateEnglishForPost({
            id: post.id,
            title: post.title,
            description: post.description,
            keywords: post.keywords,
            content: currentContent,
            styleId: config.styleId,
          });

          updateValues.enTitle = english.enTitle;
          updateValues.enSlug = english.enSlug;
          updateValues.enDescription = english.enDescription;
          updateValues.enKeywords = english.enKeywords.join(",");
          updateValues.enContent = english.enContent;
          updateValues.enUpdatedAt = new Date();
          generatedEn += 1;
          console.log(
            `generate_en done #${post.id}: ${english.enSlug}, input=${english.inputLength}${english.inputTruncated ? ", truncated" : ""}`,
          );
        } catch (error) {
          failedEn += 1;
          console.error(
            `generate_en failed #${post.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    if (Object.keys(updateValues).length > 0) {
      if (config.write) {
        await db
          .update(posts)
          .set({ ...updateValues, updatedAt: new Date() })
          .where(eq(posts.id, post.id));
      } else {
        console.log(`would_update #${post.id}: ${Object.keys(updateValues).join(", ")}`);
      }
    }
  }

  console.table({
    loaded: rows.length,
    convertedZh,
    convertedEn,
    generatedEn,
    skippedEnDryRun: skippedEn,
    failedEn,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
