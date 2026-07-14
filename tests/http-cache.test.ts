import assert from "node:assert/strict";
import test from "node:test";

import {
  createWeakFileEtag,
  matchesHttpCacheValidators,
} from "../packages/core/http-cache";

void test("file etag is stable for the same size and modification time", () => {
  assert.equal(createWeakFileEtag(255, 1_000), 'W/"ff-3e8"');
});

void test("etag validators take precedence over modified-since", () => {
  assert.equal(
    matchesHttpCacheValidators({
      headers: new Headers({
        "if-none-match": 'W/"10-20"',
        "if-modified-since": new Date("2030-01-01").toUTCString(),
      }),
      etag: 'W/"10-21"',
      lastModified: new Date("2026-01-01"),
    }),
    false,
  );
});

void test("modified-since matches at HTTP second precision", () => {
  const lastModified = new Date("2026-07-14T00:00:00.900Z");
  assert.equal(
    matchesHttpCacheValidators({
      headers: new Headers({
        "if-modified-since": "Tue, 14 Jul 2026 00:00:00 GMT",
      }),
      etag: 'W/"1-1"',
      lastModified,
    }),
    true,
  );
});
