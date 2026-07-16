import assert from "node:assert/strict";
import test from "node:test";

import {
  getImageSrc,
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";

void test("isRenderableImageSrc accepts local paths and http(s) urls only", () => {
  assert.equal(isRenderableImageSrc("/uploads/a.webp"), true);
  assert.equal(isRenderableImageSrc("https://cdn.example/a.webp"), true);
  assert.equal(isRenderableImageSrc("http://cdn.example/a.webp"), true);
  assert.equal(isRenderableImageSrc("//cdn.example/a.webp"), false);
  assert.equal(isRenderableImageSrc("data:image/png;base64,AAAA"), false);
  assert.equal(isRenderableImageSrc(""), false);
  assert.equal(isRenderableImageSrc(null), false);
  assert.equal(isRenderableImageSrc(undefined), false);
});

void test("getImageSrc leaves non-upload sources untouched", () => {
  assert.equal(
    getImageSrc("https://cdn.example/a.webp"),
    "https://cdn.example/a.webp",
  );
  assert.equal(getImageSrc("/static/logo.svg"), "/static/logo.svg");
});

void test("getImageSrc prefixes upload paths with the configured site url", () => {
  const original = process.env.NEXT_PUBLIC_URL;
  try {
    process.env.NEXT_PUBLIC_URL = "https://example.com/";
    assert.equal(
      getImageSrc("/uploads/a.webp"),
      "https://example.com/uploads/a.webp",
    );

    delete process.env.NEXT_PUBLIC_URL;
    assert.equal(
      getImageSrc("/uploads/a.webp"),
      "https://fwqgo.com/uploads/a.webp",
    );
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_URL;
    } else {
      process.env.NEXT_PUBLIC_URL = original;
    }
  }
});

void test("getOptimizedImageSrc routes upload paths through the image proxy", () => {
  assert.equal(
    getOptimizedImageSrc("/uploads/a b.webp"),
    "/api/images/source?path=%2Fuploads%2Fa%20b.webp",
  );
  assert.equal(
    getOptimizedImageSrc("https://cdn.example/a.webp"),
    "https://cdn.example/a.webp",
  );
});
