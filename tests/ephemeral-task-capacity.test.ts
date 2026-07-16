import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const scrapeSource = fs.readFileSync(
  "src/features/cms/actions/scrape.ts",
  "utf8",
);
const coverSource = fs.readFileSync(
  "src/features/cms/actions/article-cover-image.ts",
  "utf8",
);

void test("scrape jobs reserve capacity before storing or enqueueing", () => {
  const actionStart = scrapeSource.indexOf(
    "export async function scrapeArticleAction",
  );
  const actionEnd = scrapeSource.indexOf(
    "export async function getScrapeArticleJobStatusAction",
  );
  const actionSource = scrapeSource.slice(actionStart, actionEnd);
  const reserveOffset = actionSource.indexOf("reserveBoundedMapCapacity(");
  const setOffset = actionSource.indexOf("scrapeJobs.set(");
  const enqueueOffset = actionSource.indexOf("enqueueAdminBackgroundJob(");

  assert.ok(actionStart >= 0);
  assert.ok(reserveOffset >= 0);
  assert.ok(setOffset > reserveOffset);
  assert.ok(enqueueOffset > setOffset);
  assert.match(actionSource, /当前活跃抓取任务过多/);
  assert.doesNotMatch(scrapeSource, /function pruneScrapeJobs/);
  assert.match(scrapeSource, /throw new Error\("抓取任务状态已丢失/);
});

void test("ephemeral cover jobs reserve capacity before storing or enqueueing", () => {
  const branchStart = coverSource.indexOf(
    "const imageConfig = await requireActiveImageConfig(payload.configId);",
    coverSource.indexOf("if (payload.postId)"),
  );
  const branchEnd = coverSource.indexOf(
    "export async function batchGenerateArticleCoverImagesAction",
  );
  const branchSource = coverSource.slice(branchStart, branchEnd);
  const reserveOffset = branchSource.indexOf("reserveBoundedMapCapacity(");
  const setOffset = branchSource.indexOf("ephemeralCoverBatches.set(");
  const enqueueOffset = branchSource.indexOf("enqueueAdminBackgroundJob(");

  assert.ok(branchStart >= 0);
  assert.ok(reserveOffset >= 0);
  assert.ok(setOffset > reserveOffset);
  assert.ok(enqueueOffset > setOffset);
  assert.match(branchSource, /当前活跃封面生成任务过多/);
  assert.match(branchSource, /terminalCoverTaskStatuses\.includes/);
  assert.doesNotMatch(coverSource, /function pruneEphemeralCoverBatches/);
  assert.match(coverSource, /throw new Error\("临时封面任务状态已丢失/);
});

void test("ephemeral task limits remain bounded at their existing values", () => {
  assert.match(scrapeSource, /const MAX_SCRAPE_JOBS = 50/);
  assert.match(coverSource, /const MAX_EPHEMERAL_COVER_BATCHES = 30/);
});
