import assert from "node:assert/strict";
import test from "node:test";
import { checkPrerenderedArticleMetadata } from "./prerendered-article-metadata.mjs";

const title = "<title>Published article</title>";
const description =
  '<meta name="description" content="Published article summary">';
const canonical =
  '<link rel="canonical" href="https://fwqgo.com/fwq/posts/published">';
const noindex = '<meta name="robots" content="noindex">';
const articlePath = ".next-web/server/app/fwq/posts/published.html";

/** @param {string} head @param {string} [body] */
function document(head, body = "") {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

for (const languagePrefix of ["", "en/"]) {
  await test(`${languagePrefix || "zh/"} notFound placeholder may omit article metadata`, () => {
    const result = checkPrerenderedArticleMetadata(
      `.next-web/server/app/${languagePrefix}fwq/posts/__fwqgo_article_static_shell__.html`,
      document(noindex, '<div id="__next_error__"></div>'),
    );
    assert.equal(result.isPlaceholder, true);
  });
}

await test("a placeholder may have a streamed fallback title", () => {
  assert.equal(
    checkPrerenderedArticleMetadata(
      "__fwqgo_article_static_shell__.html",
      document(noindex, title),
    ).isPlaceholder,
    true,
  );
});

for (const head of ["", '<meta name="robots" content="index,follow">']) {
  await test(`a placeholder must keep noindex (${head || "missing robots"})`, () => {
    assert.throws(
      () =>
        checkPrerenderedArticleMetadata(
          "__fwqgo_article_static_shell__.html",
          document(head),
        ),
      /noindex placeholder policy/,
    );
  });
}

await test("noindex outside the initial head does not validate a placeholder", () => {
  assert.throws(
    () =>
      checkPrerenderedArticleMetadata(
        "__fwqgo_article_static_shell__.html",
        document("", noindex),
      ),
    /noindex placeholder policy/,
  );
});

await test("published article metadata is accepted in the initial head", () => {
  assert.equal(
    checkPrerenderedArticleMetadata(
      articlePath,
      document(title + description + canonical),
    ).isPlaceholder,
    false,
  );
});

for (const lateTitle of ["", title]) {
  await test(`a published article cannot omit or stream its title (${lateTitle ? "streamed" : "missing"})`, () => {
    assert.throws(
      () =>
        checkPrerenderedArticleMetadata(
          articlePath,
          document(description + canonical, lateTitle),
        ),
      /article title from the initial head/,
    );
  });
}

for (const metadata of [description, canonical]) {
  for (const body of ["", metadata]) {
    await test(`published metadata cannot be missing or streamed (${metadata}, ${body ? "streamed" : "missing"})`, () => {
      const head = (title + description + canonical).replace(metadata, "");
      assert.throws(
        () =>
          checkPrerenderedArticleMetadata(articlePath, document(head, body)),
        /omitted metadata from its initial head/,
      );
    });
  }
}

await test("only the exact reserved filename is treated as a placeholder", () => {
  assert.throws(
    () =>
      checkPrerenderedArticleMetadata(
        "__fwqgo_article_static_shell__-published.html",
        document(noindex),
      ),
    /article title from the initial head/,
  );
});

await test("a missing head still fails for a placeholder", () => {
  assert.throws(
    () =>
      checkPrerenderedArticleMetadata(
        "__fwqgo_article_static_shell__.html",
        noindex,
      ),
    /omitted its initial head/,
  );
});
