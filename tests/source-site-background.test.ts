import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getAiSourceSiteJobKey,
  parseAiSourceSiteJobKey,
} from "@fwqgo/core/ai-source-site-job-key";

const sourceSiteBackgroundSource = fs.readFileSync(
  "src/server/ai/source-site-background.ts",
  "utf8",
);
const sourceSiteActionSource = fs.readFileSync(
  "src/features/cms/actions/ai-source-site.ts",
  "utf8",
);
const cmsWorkerSource = fs.readFileSync(
  "src/server/admin/cms-background-workers.ts",
  "utf8",
);
const backgroundJobsSource = fs.readFileSync(
  "src/server/admin/background-jobs.ts",
  "utf8",
);

void test("source-site background job keys are canonical and strictly parsed", () => {
  assert.equal(getAiSourceSiteJobKey(42), "ai-source-site:42");
  assert.equal(parseAiSourceSiteJobKey("ai-source-site:42"), 42);

  for (const invalidKey of [
    "source-site:42",
    "ai-source-site:",
    "ai-source-site:0",
    "ai-source-site:-1",
    "ai-source-site:01",
    "ai-source-site:1.5",
    "ai-source-site:9007199254740992",
  ]) {
    assert.equal(parseAiSourceSiteJobKey(invalidKey), null);
  }

  assert.throws(() => getAiSourceSiteJobKey(0), RangeError);
  assert.throws(() => getAiSourceSiteJobKey(1.5), RangeError);
});

void test("source-site runner reads current database configuration at execution", () => {
  const runnerStart = sourceSiteBackgroundSource.indexOf(
    "export async function runAiSourceSiteInBackground",
  );
  const runnerEnd = sourceSiteBackgroundSource.indexOf(
    "function createAiSourceSiteBackgroundJobRunner",
  );
  assert.ok(runnerStart >= 0);
  assert.ok(runnerEnd > runnerStart);

  const runnerSource = sourceSiteBackgroundSource.slice(runnerStart, runnerEnd);
  assert.match(
    runnerSource,
    /const site = await getAiSourceSiteForRun\(sourceSiteId\)/,
  );
  assert.match(runnerSource, /pullSourceSiteToAiTasks\(\{/);
  assert.match(runnerSource, /siteUrl: site\.siteUrl/);
  assert.match(runnerSource, /rewriteStyleId: site\.rewriteStyleId/);
  assert.match(
    runnerSource,
    /recordAiSourceSiteRunFailure\(sourceSiteId, error\)/,
  );
});

void test("startup recovery registers existing jobs without enqueueing new jobs", () => {
  const recoveryStart = sourceSiteBackgroundSource.indexOf(
    "export async function restoreAiSourceSiteBackgroundJobRunners",
  );
  assert.ok(recoveryStart >= 0);

  const recoverySource = sourceSiteBackgroundSource.slice(recoveryStart);
  assert.match(
    recoverySource,
    /inArray\(adminBackgroundJobs\.status, \[\.\.\.RECOVERABLE_JOB_STATUSES\]\)/,
  );
  assert.match(recoverySource, /parseAiSourceSiteJobKey\(job\.jobKey\)/);
  assert.match(recoverySource, /registerAdminBackgroundJobRunner\(/);
  assert.match(
    recoverySource,
    /wakeAdminBackgroundJobWorkerForRegisteredKeys\(registeredKeys\)/,
  );
  assert.doesNotMatch(recoverySource, /enqueueAdminBackgroundJob\(/);
});

void test("CMS startup and source-site action delegate to the shared runner module", () => {
  assert.match(cmsWorkerSource, /restoreAiSourceSiteBackgroundJobRunners\(\)/);
  assert.match(
    sourceSiteActionSource,
    /enqueueAiSourceSiteBackgroundJob\(\{\s*sourceSiteId: site\.id,\s*siteName: site\.name,/s,
  );
  assert.doesNotMatch(sourceSiteActionSource, /type SourceSiteRunInput/);
  assert.doesNotMatch(
    sourceSiteActionSource,
    /function runAiSourceSiteInBackground/,
  );
});

void test("registered running jobs schedule a future stale recovery check", () => {
  const schedulerStart = backgroundJobsSource.indexOf(
    "async function scheduleRegisteredRunningBackgroundJobRecovery()",
  );
  const schedulerEnd = backgroundJobsSource.indexOf(
    "async function scheduleBlockedBackgroundJobRecovery()",
  );
  assert.ok(schedulerStart >= 0);
  assert.ok(schedulerEnd > schedulerStart);

  const schedulerSource = backgroundJobsSource.slice(
    schedulerStart,
    schedulerEnd,
  );
  assert.match(
    schedulerSource,
    /const registeredKeys = \[\.\.\.jobRunners\.keys\(\)\]/,
  );
  assert.match(schedulerSource, /eq\(adminBackgroundJobs\.status, "running"\)/);
  assert.match(
    schedulerSource,
    /inArray\(adminBackgroundJobs\.jobKey, registeredKeys\)/,
  );
  assert.match(
    schedulerSource,
    /scheduleAdminBackgroundJobWorker\(recoveryAt\)/,
  );
  assert.match(
    backgroundJobsSource,
    /await scheduleRegisteredRunningBackgroundJobRecovery\(\)/,
  );
});
