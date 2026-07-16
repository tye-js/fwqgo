import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const backgroundJobsSource = fs.readFileSync(
  "src/server/admin/background-jobs.ts",
  "utf8",
);

void test("next wake query selects the earliest registered unblocked job", () => {
  const queryStart = backgroundJobsSource.indexOf(
    "async function scheduleNextQueuedBackgroundJob()",
  );
  const queryEnd = backgroundJobsSource.indexOf(
    "export function getAdminBackgroundWorkerRuntimeSnapshot",
  );

  assert.ok(queryStart >= 0);
  assert.ok(queryEnd > queryStart);

  const querySource = backgroundJobsSource.slice(queryStart, queryEnd);
  assert.match(
    querySource,
    /const registeredKeys = \[\.\.\.jobRunners\.keys\(\)\]/,
  );
  assert.match(querySource, /eq\(adminBackgroundJobs\.status, "queued"\)/);
  assert.match(
    querySource,
    /inArray\(adminBackgroundJobs\.jobKey, registeredKeys\)/,
  );
  assert.match(querySource, /withoutRunningBackgroundJobForSameKey\(\)/);
  assert.match(
    querySource,
    /orderBy\(asc\(adminBackgroundJobs\.runAfter\), asc\(adminBackgroundJobs\.id\)\)/,
  );
  assert.match(
    querySource,
    /scheduleAdminBackgroundJobWorker\(nextJob\.runAfter\)/,
  );
});

void test("worker reschedules queued and blocked jobs after all lanes drain", () => {
  const workerStart = backgroundJobsSource.indexOf(
    "async function runAdminBackgroundJobWorker()",
  );
  const workerEnd = backgroundJobsSource.indexOf(
    "async function scheduleBlockedBackgroundJobRecovery()",
  );

  assert.ok(workerStart >= 0);
  assert.ok(workerEnd > workerStart);

  const workerSource = backgroundJobsSource.slice(workerStart, workerEnd);
  const lanesOffset = workerSource.indexOf("await Promise.all(");
  const queuedWakeOffset = workerSource.indexOf(
    "await scheduleNextQueuedBackgroundJob();",
  );
  const blockedWakeOffset = workerSource.indexOf(
    "await scheduleBlockedBackgroundJobRecovery();",
  );

  assert.ok(lanesOffset >= 0);
  assert.ok(queuedWakeOffset > lanesOffset);
  assert.ok(blockedWakeOffset > queuedWakeOffset);
});

void test("queued selection and claiming share the running-key exclusion", () => {
  const helperMatches = backgroundJobsSource.match(
    /withoutRunningBackgroundJobForSameKey\(\)/g,
  );

  assert.ok((helperMatches?.length ?? 0) >= 3);
  assert.match(
    backgroundJobsSource,
    /running_jobs\."jobKey" = \$\{adminBackgroundJobs\.jobKey\}/,
  );
  assert.match(backgroundJobsSource, /running_jobs\."status" = 'running'/);
});
