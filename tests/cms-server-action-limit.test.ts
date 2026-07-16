import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const cmsConfig = fs.readFileSync("apps/cms/next.config.js", "utf8");
const webConfig = fs.readFileSync("apps/web/next.config.js", "utf8");
const aiRewriteActions = fs.readFileSync(
  "src/features/cms/actions/ai-rewrite-task.ts",
  "utf8",
);

void test("CMS transport limit leaves room for the 2 MiB AI file contract", () => {
  assert.match(cmsConfig, /serverActions:\s*{\s*bodySizeLimit:\s*"3mb",?\s*}/);
  assert.doesNotMatch(webConfig, /serverActions:\s*{/);
  assert.match(
    aiRewriteActions,
    /fileValue\.size\s*>\s*2\s*\*\s*1024\s*\*\s*1024/,
  );
  assert.match(aiRewriteActions, /单个文件不能超过 2MB/);
});
