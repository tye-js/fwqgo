import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  reconcileSeoKeywords,
  validateSeoKeywordPlan,
} from "@fwqgo/ai/seo-keyword-plan";
import { getRewriteLengthBudget } from "@fwqgo/ai/rewrite-quality";
import {
  applyInternalLinksToArticleHtml,
  findKnowledgeAnchorInContent,
  scoreRelatedPost,
} from "@fwqgo/core/article-internal-links";

function verifyKeywordPlanning() {
  const plan = validateSeoKeywordPlan(
    {
      primaryKeyword: {
        keyword: "Zgo 洛杉矶 VPS 优惠",
        evidence: [
          { text: "Zgo", provenance: "body" },
          { text: "洛杉矶", provenance: "body" },
        ],
      },
      secondaryKeywords: [
        {
          keyword: "CN2 GIA VPS",
          evidence: [{ text: "洛杉矶", provenance: "body" }],
        },
      ],
    },
    { sourceMarkdown: "Zgo 本次提供洛杉矶 VPS 套餐，价格为 10 美元。" },
  );

  assert.equal(plan.primaryKeyword?.keyword, "Zgo 洛杉矶 VPS 优惠");
  assert.deepEqual(plan.secondaryKeywords, []);
  assert.match(plan.rejectedKeywords[0]?.reason ?? "", /CN2/);

  const taxonomyPlan = validateSeoKeywordPlan(
    {
      primaryKeyword: {
        keyword: "国外服务器",
        evidence: [{ text: "国外服务器", provenance: "taxonomy" }],
      },
    },
    {
      sourceMarkdown: "某商家发布了一款 VPS。",
      taxonomyTerms: ["国外服务器"],
    },
  );
  assert.equal(taxonomyPlan.primaryKeyword?.bodyEligible, false);

  const unsupportedPlan = validateSeoKeywordPlan(
    {
      primaryKeyword: {
        keyword: "高性价比 VPS",
        evidence: [{ text: "VPS", provenance: "body" }],
      },
    },
    { sourceMarkdown: "文章只提供 VPS 的配置和价格。" },
  );
  assert.equal(unsupportedPlan.primaryKeyword, null);

  assert.deepEqual(
    reconcileSeoKeywords({
      generatedKeywords: ["德国 VPS", "Zgo 洛杉矶 VPS 优惠"],
      plan,
      acceptedMarkdown: "本文整理 Zgo 洛杉矶 VPS 优惠和购买条件。",
    }),
    ["Zgo 洛杉矶 VPS 优惠"],
  );

  const budget = getRewriteLengthBudget("这是一段很短的服务器优惠原文。", 3);
  assert.ok(budget.targetNarrativeLength >= 180);
  assert.ok(budget.hardMaxNarrativeLength > budget.targetNarrativeLength);
}

function verifyInternalLinking() {
  const score = scoreRelatedPost(
    {
      title: "Zgo 洛杉矶 VPS",
      categoryId: 2,
      recommendedTagId: 8,
      tagIds: [8, 9],
      tagNames: ["Zgo", "洛杉矶"],
      primaryKeyword: "Zgo VPS",
    },
    {
      id: 2,
      title: "Zgo VPS 新套餐",
      categoryId: 2,
      recommendedTagId: 8,
      tagIds: [8],
      tagNames: ["Zgo"],
    },
  );
  assert.equal(score.score, 90);

  assert.equal(
    findKnowledgeAnchorInContent("正文只提到 KVM。", {
      id: 1,
      title: "CN2 GIA",
      aliases: "KVM",
    }),
    "KVM",
  );
  assert.equal(
    findKnowledgeAnchorInContent("正文没有线路名称。", {
      id: 2,
      title: "CN2 GIA",
    }),
    null,
  );

  const injected = applyInternalLinksToArticleHtml(
    '<h2>CN2 GIA</h2><p>CN2 GIA 是本文涉及的线路。</p><table><tr><td>CN2 GIA</td></tr></table><p><a href="/existing">KVM</a></p>',
    [
      {
        targetKey: "knowledge:1",
        anchorText: "CN2 GIA",
        href: "/knowledge/cn2-gia",
      },
    ],
  );
  assert.deepEqual(injected.appliedTargetKeys, ["knowledge:1"]);
  assert.match(injected.html, /data-internal-link="knowledge:1"/);
  assert.match(injected.html, /<td>CN2 GIA<\/td>/);
  assert.match(injected.html, /href="\/existing"/);

  const external = applyInternalLinksToArticleHtml("<p>KVM 套餐</p>", [
    {
      targetKey: "external",
      anchorText: "KVM",
      href: "https://example.com",
    },
  ]);
  assert.deepEqual(external.appliedTargetKeys, []);
  assert.doesNotMatch(external.html, /<a /);
}

async function verifyMigrationScope() {
  const migration = await readFile(
    new URL("../drizzle/0062_post_internal_links.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE "post_internal_links"/);
  assert.doesNotMatch(migration, /network_experience/);
  assert.doesNotMatch(migration, /knowledge_article_modules/);
  assert.match(migration, /post_internal_links_no_self_post_link_check/);
}

async function main() {
  verifyKeywordPlanning();
  verifyInternalLinking();
  await verifyMigrationScope();
  console.log("Article SEO and internal-link verification passed.");
}

void main();
