import assert from "node:assert/strict";
import test from "node:test";

import { getPublicCacheEventTargets } from "@fwqgo/cache/tags";

void test("offer cache events do not invalidate unrelated post sitemaps", () => {
  const targets = getPublicCacheEventTargets("offer.changed", {
    topicSlugs: ["hong-kong"],
  });

  assert.ok(targets.tags.includes("server-offers"));
  assert.ok(targets.tags.includes("server-offer-topic:hong-kong"));
  assert.ok(targets.paths.includes("/servers"));
  assert.ok(targets.paths.includes("/servers/hong-kong"));
  assert.equal(targets.paths.includes("/sitemap-posts.xml"), false);
});

void test("post cache events include only requested post identities", () => {
  const targets = getPublicCacheEventTargets("post.changed", {
    postIds: [12, 12, -1],
    postSlugs: ["example-post", "example-post", ""],
  });

  assert.equal(targets.tags.filter((tag) => tag === "post:12").length, 1);
  assert.ok(targets.tags.includes("post-slug:example-post"));
  assert.ok(targets.paths.includes("/fwq/posts/example-post"));
  assert.ok(targets.paths.includes("/en/fwq/posts/example-post"));
});
