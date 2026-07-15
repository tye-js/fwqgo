import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGeneratedImageSource,
  readGeneratedImageResponse,
} from "../packages/core/image-generation-response";

void test("recognizes relative generated image URLs", () => {
  assert.deepEqual(
    extractGeneratedImageSource({ image: "/generated/cover.png?token=abc" }),
    {
      kind: "url",
      value: "/generated/cover.png?token=abc",
    },
  );
});

void test("preserves the MIME type from a base64 data URI", () => {
  const webpBytes = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WEBP"),
  ]);
  const source = extractGeneratedImageSource({
    image: `data:image/webp;base64,${webpBytes.toString("base64")}`,
  });

  assert.equal(source?.kind, "bytes");
  if (source?.kind !== "bytes") return;
  assert.equal(source.mime, "image/webp");
  assert.deepEqual(Buffer.from(source.bytes), webpBytes);
});

void test("rejects malformed base64 image responses", () => {
  assert.throws(
    () => extractGeneratedImageSource({ b64_json: "not valid base64%%%" }),
    /base64 图片数据格式无效/,
  );
});

void test("rejects successful HTML downloads masquerading as images", async () => {
  await assert.rejects(
    readGeneratedImageResponse(
      new Response("<html>error</html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      1024,
    ),
    /不是有效 PNG、JPEG、GIF 或 WebP 图片/,
  );
});

void test("accepts a valid image when a CDN uses a generic content type", async () => {
  const pngSignature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const image = await readGeneratedImageResponse(
    new Response(pngSignature, {
      headers: { "content-type": "application/octet-stream" },
    }),
    1024,
  );

  assert.equal(image.mime, "image/png");
  assert.deepEqual(image.bytes, pngSignature);
});

void test("stops generated image downloads at the configured limit", async () => {
  await assert.rejects(
    readGeneratedImageResponse(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-type": "image/png" },
      }),
      3,
    ),
    /超过 1 MB 限制/,
  );
});
