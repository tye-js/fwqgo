import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGeneratedImageSource,
  readGeneratedImageResponse,
} from "../packages/core/image-generation-response";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const pngDataUri = `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`;

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

void test("decodes data URIs returned in URL fields", () => {
  for (const payload of [
    { data: [{ url: pngDataUri }] },
    { image_url: pngDataUri },
    { url: pngDataUri },
    { result_url: pngDataUri },
  ]) {
    const source = extractGeneratedImageSource(payload);
    assert.equal(source?.kind, "bytes");
    if (source?.kind !== "bytes") continue;
    assert.equal(source.mime, "image/png");
    assert.deepEqual(Buffer.from(source.bytes), Buffer.from(pngBytes));
  }
});

void test("supports nested image2 data and alternate base64 fields", () => {
  const nested = extractGeneratedImageSource({
    data: { data: [{ data_url: pngDataUri }] },
  });
  assert.equal(nested?.kind, "bytes");

  const rawBase64 = extractGeneratedImageSource({
    data: [{ base64: Buffer.from(pngBytes).toString("base64") }],
  });
  assert.equal(rawBase64?.kind, "bytes");
  if (rawBase64?.kind !== "bytes") return;
  assert.deepEqual(Buffer.from(rawBase64.bytes), Buffer.from(pngBytes));
});

void test("uses the first usable image when a relay returns multiple results", () => {
  const source = extractGeneratedImageSource({
    data: [{ url: "" }, { result_url: "https://cdn.example.com/image.png" }],
  });

  assert.deepEqual(source, {
    kind: "url",
    value: "https://cdn.example.com/image.png",
  });
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
  const image = await readGeneratedImageResponse(
    new Response(pngBytes, {
      headers: { "content-type": "application/octet-stream" },
    }),
    1024,
  );

  assert.equal(image.mime, "image/png");
  assert.deepEqual(image.bytes, pngBytes);
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
