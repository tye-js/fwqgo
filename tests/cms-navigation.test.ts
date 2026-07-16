import assert from "node:assert/strict";
import test from "node:test";

import { cmsNavigation, isCmsPathMatch } from "@/features/cms/lib/navigation";

void test("CMS navigation keeps the simplified top-level structure", () => {
  assert.deepEqual(
    cmsNavigation.map((item) => item.title),
    ["概览", "内容", "套餐", "媒体", "运营", "模型与接口"],
  );
});

void test("CMS navigation maps legacy routes to their consolidated entries", () => {
  const contentItems = cmsNavigation.find(
    (item) => item.title === "内容",
  )?.items;
  const mediaItems = cmsNavigation.find((item) => item.title === "媒体")?.items;
  const operationsItems = cmsNavigation.find(
    (item) => item.title === "运营",
  )?.items;

  const articleLibrary = contentItems?.find((item) => item.title === "文章库");
  const imageGeneration = mediaItems?.find((item) => item.title === "AI 生图");
  const seoManagement = operationsItems?.find(
    (item) => item.title === "SEO 管理",
  );

  assert.ok(articleLibrary);
  assert.equal(
    isCmsPathMatch(
      "/posts/drafts",
      articleLibrary.url,
      articleLibrary.matchUrls,
    ),
    true,
  );
  assert.ok(imageGeneration);
  assert.equal(
    isCmsPathMatch(
      "/images/covers",
      imageGeneration.url,
      imageGeneration.matchUrls,
    ),
    true,
  );
  assert.ok(seoManagement);
  assert.equal(
    isCmsPathMatch("/seo/tag", seoManagement.url, seoManagement.matchUrls),
    true,
  );
  assert.equal(isCmsPathMatch("/servers/monitor", "/servers/manage"), false);
});
