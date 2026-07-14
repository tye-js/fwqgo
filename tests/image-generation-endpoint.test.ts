import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImageGenerationEndpoint,
  formatImageGenerationHttpError,
  normalizeImageGenerationResultUrl,
} from "../packages/core/image-generation-endpoint";

void test("builds image generation endpoints from roots and full paths", () => {
  assert.equal(
    buildImageGenerationEndpoint("https://api.example.com/"),
    "https://api.example.com/v1/images/generations",
  );
  assert.equal(
    buildImageGenerationEndpoint(
      "https://images.example.com/v1/images/generations",
    ),
    "https://images.example.com/v1/images/generations",
  );
});

void test("explains providers that require a dedicated image host", () => {
  const message = formatImageGenerationHttpError({
    status: 400,
    statusText: "Bad Request",
    responseText: JSON.stringify({
      error: {
        message:
          "Image API has moved to the dedicated image endpoint; it is no longer served on this host.",
        code: "use_image_endpoint",
      },
    }),
    baseUrl: "https://text.example.com/v1",
  });
  assert.match(message, /通用接口主机/);
  assert.match(message, /图片专用完整地址/);
  assert.doesNotMatch(message, /use_image_endpoint/);
});

void test("resolves relative image results through the configured relay", () => {
  assert.equal(
    normalizeImageGenerationResultUrl(
      "/generated/cover.png?token=abc",
      "https://relay.example.com/v1/images/generations",
    ),
    "https://relay.example.com/generated/cover.png?token=abc",
  );
});

void test("maps leaked private image URLs to the configured public relay", () => {
  assert.equal(
    normalizeImageGenerationResultUrl(
      "http://127.0.0.1:8080/files/cover.png?token=abc",
      "https://relay.example.com/v1/images/generations",
    ),
    "https://relay.example.com/files/cover.png?token=abc",
  );
  assert.equal(
    normalizeImageGenerationResultUrl(
      "http://image-worker.internal/output/cover.png",
      "https://relay.example.com/v1/images/generations",
    ),
    "https://relay.example.com/output/cover.png",
  );
});

void test("preserves public image result URLs", () => {
  assert.equal(
    normalizeImageGenerationResultUrl(
      "https://cdn.example.com/cover.png",
      "https://relay.example.com/v1/images/generations",
    ),
    "https://cdn.example.com/cover.png",
  );
});
