import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

void test("public home renders bilingual content, source-backed counts and independent article destinations", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as cheerio from "cheerio";
import {mock} from "bun:test";
mock.module("next/navigation",()=>({useRouter:()=>({push(){}})}));
const {PublicHomePage}=await import("./src/features/public/components/home-page.tsx");
const posts=Array.from({length:8},(_,i)=>({id:i+1,title:"Server guide "+(i+1),slug:"guide-"+(i+1),description:"A complete guide description with a clear source.",imgUrl:"/img/placeholders/fwq-placeholder.png",createdAt:new Date("2026-09-01T00:00:00Z"),tags:[]}));
const props={posts,sidebarData:{promotedPosts:[],editorPicks:[]},latestOffers:[],offerCounts:[{slug:"hong-kong",count:7}],totalOfferCount:7,homepageSlots:[],collections:{providers:[],regions:[],lines:[]},knowledge:[]};
for(const language of ["zh","en"]){
 const html=renderToStaticMarkup(React.createElement(PublicHomePage,{...props,language}));
 const $=cheerio.load(html),prefix=language==="en"?"/en":"";
 assert.equal($("main#main-content").length,1);assert.equal($("h1").length,1);
 assert.equal($("[data-testid=article-card]").length,8);
 assert.equal(new Set($("[data-testid=article-card] h3").toArray().map(node=>$(node).attr("id"))).size,8);
 for(const post of posts)assert.ok($('a[href="'+prefix+'/fwq/posts/'+post.slug+'"]').length>0);
 for(const href of [prefix+"/fwq/page/1",prefix+"/knowledge",prefix+"/tools/network-lines",prefix+"/tools/server-sizing","/servers"]){assert.ok($('a[href="'+href+'"]').length>0,href);}
 if(language==="en"){assert.equal($('a[href^="/fwq/posts/"]').length,0);assert.equal($('input[name="lang"]').attr("value"),"en");}
 assert.ok(!html.includes("undefined"));assert.ok(!html.includes("NaN"));
 $("a[href]").each((_,a)=>{const href=$(a).attr("href");if(href&&!/^(#|mailto:|tel:)/.test(href))assert.equal($(a).attr("target"),"_blank",href);});
 assert.equal($("aside .public-stat").first().text(),"7");
 const empty=cheerio.load(renderToStaticMarkup(React.createElement(PublicHomePage,{...props,language,posts:[],offerCounts:[],totalOfferCount:0})));
 assert.equal(empty("h1").length,1);assert.equal(empty("[data-testid=article-card]").length,0);
 assert.equal(empty("aside .public-stat").length,0);
 assert.ok(empty('a[href="'+prefix+'/knowledge"]').length>0);
 const withPicks=cheerio.load(renderToStaticMarkup(React.createElement(PublicHomePage,{...props,language,sidebarData:{editorPicks:posts.slice(0,5),promotedPosts:posts.slice(5,6)}})));
 const heading=language==="en"?"Editor's picks":"站长推荐";
 const picks=withPicks("aside section").filter((_,node)=>withPicks(node).find("h2").text()===heading);
 assert.equal(picks.length,1);assert.equal(picks.find("a").length,5);
 assert.deepEqual(picks.find("a").toArray().map(node=>withPicks(node).attr("href")),posts.slice(0,5).map(post=>prefix+"/fwq/posts/"+post.slug));
 assert.ok(withPicks("aside").text().includes(language==="en"?"Featured promotions":"精选推广"));
 assert.ok(!withPicks("aside").text().includes(language==="en"?"all-time article views":"累计浏览量"));
}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("homepage editor picks use the latest five public articles in the named category for each language", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import {Database} from "bun:sqlite";
import {drizzle} from "drizzle-orm/pg-proxy";
import {mock} from "bun:test";
const database=new Database(":memory:");
database.exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, description TEXT, imgUrl TEXT, views INTEGER, createdAt TEXT, categoryId INTEGER, language TEXT, published INTEGER, content TEXT); CREATE TABLE homepage_slots (id INTEGER PRIMARY KEY, postId INTEGER, language TEXT, placement TEXT, contentType TEXT, enabled INTEGER, startsAt TEXT, endsAt TEXT, sortOrder INTEGER, createdAt TEXT);');
database.run("INSERT INTO categories VALUES (1, ?), (2, ?)",["站长推荐","其他文章"]);
function put(id,overrides={}){
 const row={id,title:"Article "+id,slug:"article-"+id,description:"Description",imgUrl:null,views:1,createdAt:"2026-09-01T00:00:00Z",categoryId:1,language:"zh",published:1,content:"Complete article prose. ".repeat(80),...overrides};
 database.run('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',Object.values(row));
}
for(const [language,offset] of [["zh",0],["en",100]]){
 for(let i=1;i<=7;i++)put(offset+i,{language,views:i===1?999999:1,createdAt:"2026-09-0"+(i===6?7:i)+"T00:00:00Z"});
 put(offset+8,{language,published:0,createdAt:"2026-09-30T00:00:00Z"});
 put(offset+9,{language,categoryId:2,views:9999999,createdAt:"2026-09-30T00:00:00Z"});
 put(offset+10,{language,content:"",createdAt:"2026-09-30T00:00:00Z"});
 put(offset+11,{language,title:" ",createdAt:"2026-09-30T00:00:00Z"});
 put(offset+12,{language,slug:" ",createdAt:"2026-09-30T00:00:00Z"});
 database.run('INSERT INTO homepage_slots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',[offset+1,offset+7,language,"sidebar","post",1,null,null,1,"2026-09-01T00:00:00Z"]);
}
let fail=false;const cacheTags=new Set();
// Execute the real Drizzle query against in-memory SQL. Only the PostgreSQL
// string-function names and boolean bindings need SQLite equivalents.
const readDb=drizzle(async(query,params)=>{
 if(fail&&query.includes('join "categories"'))throw new Error("Fixture database failure");
 return {rows:database.query(query.replaceAll("char_length(","length(").replaceAll("btrim(","trim(")).values(...params.map(value=>typeof value==="boolean"?Number(value):value))};
});
mock.module("@fwqgo/db",()=>({readDb}));
mock.module("next/cache",()=>({cacheLife(){},cacheTag(...tags){tags.forEach(tag=>cacheTags.add(tag));},revalidatePath(){},revalidateTag(){},updateTag(){}}));
const {getHomepageSidebarData}=await import("./src/features/public/data/post.ts");
try{
 for(const [language,offset] of [["zh",0],["en",100]]){
  const {data}=await getHomepageSidebarData(language);
  assert.deepEqual(data.editorPicks.map(post=>post.id),[7,6,5,4,3].map(id=>id+offset));
  assert.equal(data.promotedPosts[0].id,offset+7,"Promotion placement must not remove the newest category article");
 }
 assert.ok(cacheTags.has("categories"));assert.ok(cacheTags.has("posts"));
 database.run("UPDATE categories SET name = ? WHERE id = 1",["已更名分类"]);
 for(const language of ["zh","en"])assert.deepEqual((await getHomepageSidebarData(language)).data.editorPicks,[],"Do not fill an absent category with unrelated popular articles");
 fail=true;await assert.rejects(getHomepageSidebarData("zh"),/获取首页站长推荐文章失败/);
}finally{database.close();}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("article cards preserve published tag URLs and image loading priority", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as cheerio from "cheerio";
import ArticleCard from "./src/features/public/components/article-card.tsx";
const post={id:1,title:"Article",slug:"article",description:"Description",createdAt:new Date("2026-09-01"),imgUrl:"/uploads/example.webp",tags:[{tag:{id:1,name:"CN2 GIA",slug:"cn2-gia",publiclyIndexable:true}},{tag:{id:2,name:"Private topic",slug:"private-topic",publiclyIndexable:false}}]};
for(const language of ["zh","en"]){
 for(const variant of ["feature","list","compact"]){
  const $=cheerio.load(renderToStaticMarkup(React.createElement(ArticleCard,{post,language,variant}))),prefix=language==="en"?"/en":"";
  assert.ok($('a[href="'+prefix+'/fwq/tags/cn2-gia/page/1"]').length>0);
  assert.equal($('a[href*="private-topic"]').length,0);
  assert.equal($("img").attr("loading"),variant==="feature"?"eager":"lazy");
  assert.equal($("img").attr("alt"),"Article");
 }
}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("header navigation localizes article categories on the English tree and falls back per field", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import {buildPublicNav} from "./src/features/public/components/public-nav.ts";
import {headerCopy} from "./src/features/public/components/header-copy.ts";
const categories=[
 {id:2,name:"国内服务器",slug:"fuwuqi",description:"中文描述",enName:"China Servers",enSlug:"china-servers",enDescription:"Compare China mainland VPS.",zhPublishedPostCount:12,enPublishedPostCount:4},
 {id:9,name:"日本服务器",slug:"jp-vps",description:"中文描述",enName:"Japan VPS",enSlug:"japan-vps",enDescription:"Tokyo and Osaka offers.",zhPublishedPostCount:8,enPublishedPostCount:2},
 {id:99,name:"测试分类",slug:"test-category",description:"中文描述",enName:null,enSlug:null,enDescription:null,zhPublishedPostCount:3,enPublishedPostCount:1},
 // 有 enSlug 但没有英文稿 → 英文树里 /en/fwq/chinese-only/page/1 会 404，不该进英文导航。
 {id:98,name:"只有中文稿",slug:"zh-only",description:"中文描述",enName:"Chinese Only",enSlug:"chinese-only",enDescription:null,zhPublishedPostCount:5,enPublishedPostCount:0},
 // 反方向：有 zhSlug 但没有中文稿 → 不该进中文导航。
 {id:97,name:"只有英文稿",slug:"zh-empty",description:"中文描述",enName:"English Only",enSlug:"english-only",enDescription:"Only English posts.",zhPublishedPostCount:0,enPublishedPostCount:6},
];
const zh=buildPublicNav({language:"zh",copy:headerCopy.zh,categories});
const en=buildPublicNav({language:"en",copy:headerCopy.en,categories});

// 对应语言没有已发布稿件的分类要从导航里剔掉 —— 否则就是死链（实测英文导航里 4 个分类
// 只有 enSlug、没有英文稿，点进去全部 404）。两侧都要断言，且要有阳性对照（留下来的还在）。
assert.deepEqual(zh.categories.map((item)=>item.href),["/fwq/fuwuqi/page/1","/fwq/jp-vps/page/1","/fwq/test-category/page/1","/fwq/zh-only/page/1"]);
assert.deepEqual(en.categories.map((item)=>item.href),["/en/fwq/china-servers/page/1","/en/fwq/japan-vps/page/1","/en/fwq/test-category/page/1","/en/fwq/english-only/page/1"]);
assert.ok(!en.categories.some((item)=>item.href.includes("chinese-only")),"没有英文稿的分类不该出现在英文导航里");
assert.ok(!zh.categories.some((item)=>item.href.includes("zh-empty")),"没有中文稿的分类不该出现在中文导航里");

// 中文侧保持直读数据库字段：分类名与描述在 CMS 里维护，走覆盖表会把改动盖掉。
assert.equal(zh.categories[0].label,"国内服务器");
assert.equal(zh.categories[0].href,"/fwq/fuwuqi/page/1");
assert.equal(zh.categories[0].description,"中文描述");
assert.deepEqual(zh.categories[0].matchPrefixes,["/fwq/fuwuqi/page/"]);

// 英文侧换成英文字段 —— /en 的导航不该出现中文分类名，也不该指向中文 slug。
assert.equal(en.categories[0].label,"China Servers");
assert.equal(en.categories[0].href,"/en/fwq/china-servers/page/1");
assert.equal(en.categories[0].description,"Compare China mainland VPS.");
assert.deepEqual(en.categories[0].matchPrefixes,["/en/fwq/china-servers/page/"]);
for(const item of en.categories.slice(0,2)){
 assert.ok(!/\p{Script=Han}/u.test(item.label),item.label);
 assert.ok(!/\p{Script=Han}/u.test(item.description??""),item.description);
 assert.ok(!/\p{Script=Han}/u.test(item.href),item.href);
}

// 英文名复用 public-article-category.ts 的覆盖表，与分类页标题同源。
assert.equal(en.categories[1].label,"Japan Servers");

// 缺英文字段时按字段回落：名字回中文名，slug 回中文 slug，描述给英文兜底句。
assert.equal(en.categories[2].label,"测试分类");
assert.equal(en.categories[2].href,"/en/fwq/test-category/page/1");
assert.ok(en.categories[2].description?.startsWith("Articles, reviews, and buying guides for"),en.categories[2].description);

// 空白英文字段视同缺失。
const blank=buildPublicNav({language:"en",copy:headerCopy.en,categories:[{id:96,name:"空白分类",slug:"blank-category",description:"中文描述",enName:"   ",enSlug:"  ",enDescription:"   ",zhPublishedPostCount:1,enPublishedPostCount:1}]});
assert.equal(blank.categories[0].label,"空白分类");
assert.equal(blank.categories[0].href,"/en/fwq/blank-category/page/1");

// 非分类项不受影响：比价入口故意不带语言前缀，工具项带前缀。
assert.deepEqual(en.deals.map((item)=>item.href),["/servers","/servers/hong-kong","/servers/united-states","/servers/cheap-vps"]);
assert.deepEqual(en.tools.map((item)=>item.href),["/en/tools/server-sizing","/en/tools/network-lines"]);
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("language switch fallback never guesses a slug in the other language tree", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import {buildLanguageSwitchFallbackHref} from "./src/features/public/lib/language-switch-href.ts";
const href=(pathname,target,query="")=>buildLanguageSwitchFallbackHref(pathname,new URLSearchParams(query),target);

// 含 slug 的分类/标签页：两侧的 slug 不同，猜前缀会得到 404（实测 5 个死链）。
// 有对应语言版本时由 hreflang alternate 接管，走到兜底说明没有 → 回目标语言首页。
assert.equal(href("/fwq/ddos-vps/page/1","en"),"/en");
assert.equal(href("/fwq/tags/vps优惠/page/1","en"),"/en");
assert.equal(href("/fwq/large-bandwidth-vps/page/1","en"),"/en");
assert.equal(href("/en/fwq/china-servers/page/1","zh"),"/");
// 文章页 slug 也是中文的，同样不能猜。
assert.equal(href("/fwq/posts/某篇文章","en"),"/en");
assert.equal(href("/en/fwq/posts/some-post","zh"),"/");

// 阳性对照：**不含 slug** 的分页路径仍然加/去前缀，不能一律回首页。
assert.equal(href("/fwq/page/3","en"),"/en/fwq/page/3");
assert.equal(href("/en/fwq/page/3","zh"),"/fwq/page/3");

// 阳性对照：这几类 slug 两棵树相同，映射必须保留。
assert.equal(href("/about","en"),"/en/about");
assert.equal(href("/en/terms","zh"),"/terms");
assert.equal(href("/knowledge/foo","en"),"/en/knowledge");
assert.equal(href("/en/knowledge/bar","zh"),"/knowledge");
assert.equal(href("/search","en"),"/search?lang=en");
assert.equal(href("/search","zh","lang=en&q=x"),"/search?q=x");

// 根路径与「已在目标语言树内」。
assert.equal(href("/","en"),"/en");
assert.equal(href("/en","zh"),"/");
assert.equal(href("/en/fwq/page/1","en"),"/en/fwq/page/1");
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("sitewide JSON-LD nodes each carry their own @context", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "./src/features/public/lib/site-structured-data.ts";

const context = "https://schema.org";
const website = buildWebSiteJsonLd({ language: "zh", name: "服务器go", description: "描述" });
const websiteEn = buildWebSiteJsonLd({ language: "en", name: "fwqgo" });
const organization = buildOrganizationJsonLd({ name: "服务器go" });

// @context 是**局部**属性：数组里某个节点带了不作用于兄弟节点。
// 调用方把它们放进同一个顶层数组，所以每个节点都必须自带。
for (const node of [website, websiteEn, organization]) {
  assert.equal(node["@context"], context, String(node["@type"]));
  assert.ok(node["@type"], "每个节点都要有 @type");
  assert.ok(node["@id"], "每个节点都要有 @id");
}

// 交叉引用靠 @id，不能被 @context 改动破坏。
assert.equal(website.publisher["@id"], organization["@id"]);

// 模拟调用方的数组形态：序列化后每个节点都带 @context（这正是审计里那条判据）。
const serialized = JSON.parse(JSON.stringify([website, organization]));
for (const node of serialized) {
  assert.equal(node["@context"], context, "数组形态下每个节点都要带 @context");
}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("collection queries preserve canonical links and leave unmapped labels as text", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as cheerio from "cheerio";
import {Database} from "bun:sqlite";
import {getTableColumns, getTableName} from "drizzle-orm";
import {drizzle} from "drizzle-orm/pg-proxy";
import {mock} from "bun:test";
import {affServiceProviders, serverRegions, serverNetworkLines, serverOffers} from "./packages/db/schema.ts";
const database = new Database(":memory:");
// Run the real projection, joins/subqueries and row mapping against SQL.
for (const table of [affServiceProviders, serverRegions, serverNetworkLines, serverOffers]) {
  const columns = Object.values(getTableColumns(table)).map(column =>
    '"' + column.name + '" ' + (["number", "boolean"].includes(column.dataType) ? "NUMERIC" : "TEXT"));
  database.exec('CREATE TABLE "' + getTableName(table) + '" (' + columns.join(", ") + ')');
}
function insert(table, row) {
  const keys = Object.keys(row);
  database.run('INSERT INTO "' + table + '" (' + keys.map(key => '"' + key + '"').join(",") + ') VALUES (' + keys.map(() => '?').join(",") + ')', Object.values(row));
}
insert("aff_service_providers", {id:1, name:"Fixture Provider", slug:"fixture-provider"});
insert("server_regions", {id:1, name:"美国", enName:"United States", slug:"united-states", active:1});
insert("server_network_lines", {id:1, name:"CN2 GIA", slug:"cn2-gia", active:1});
const offer = {id:1, title:"Fixture VPS", slug:"fixture-vps", providerId:1, providerName:"Fixture Provider", regionId:1, region:"美国", lineId:1, lineType:"CN2 GIA", priceAmount:"5", monthlyPriceUsd:"5", currency:"USD", billingCycle:"monthly", purchaseUrl:"https://example.test/buy", status:"in_stock", visible:1, featured:0, createdAt:"2026-09-01T00:00:00Z"};
insert("server_offers", offer);
const readDb = drizzle(async (query, params) => ({rows:database.query(query).values(...params.map(value => typeof value === "boolean" ? Number(value) : value))}));
mock.module("@fwqgo/db", () => ({db:readDb, readDb}));
mock.module("next/cache", () => ({cacheLife(){}, unstable_cache:fn=>fn}));
mock.module("@fwqgo/cache/tags", () => ({cacheTags:{serverOffers:"offers"}, tagCache(){}, revalidateSiteContent(){}}));
mock.module("@fwqgo/auth/session", () => ({requireAdminSession(){throw new Error("Unexpected admin mutation");}}));
const {getServerOfferCollection} = await import("./src/server/offers/server-offers.ts");
const {ServerOfferTable} = await import("./src/features/public/components/server-offer-table.tsx");
const selector = 'a[href^="/servers/providers/"],a[href^="/servers/regions/"],a[href^="/servers/lines/"]';
function render(offers) {return cheerio.load(renderToStaticMarkup(React.createElement(ServerOfferTable, {offers})));}
try {
  for (const [kind, slug] of [["provider", "fixture-provider"], ["region", "united-states"], ["line", "cn2-gia"]]) {
    const data = await getServerOfferCollection({kind, value:slug});
    assert.ok(data, kind);
    const row = data.offers[0];
    assert.equal(row.providerSlug, "fixture-provider");
    assert.equal(row.regionSlug, "united-states");
    assert.equal(row.lineSlug, "cn2-gia");
    assert.equal(row.regionEnName, "United States");
    const $ = render(data.offers);
    for (const href of ["/servers/providers/fixture-provider", "/servers/regions/united-states", "/servers/lines/cn2-gia"]) {
      assert.equal($('a[href="' + href + '"]').length, 2, kind + ": desktop and mobile links " + href);
    }
  }
  // The provider is mapped, while region/line retain source labels without dictionary IDs.
  database.run('UPDATE server_offers SET "regionId" = NULL, "lineId" = NULL');
  const partial = await getServerOfferCollection({kind:"provider", value:"fixture-provider"});
  assert.equal(partial.offers[0].regionSlug, null);
  assert.equal(partial.offers[0].lineSlug, null);
  const $ = render(partial.offers);
  assert.equal($(selector).length, 2, "Only the provider stays linked in both layouts");
  assert.ok($.text().includes("美国"));
  assert.ok($.text().includes("CN2 GIA"));
  assert.equal(await getServerOfferCollection({kind:"provider", value:"unknown-provider"}), null);
} finally {database.close();}
`,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

function runA11yFixture(source: string) {
  const cwd = mkdtempSync(path.join(tmpdir(), "fwqgo-a11y-"));
  try {
    const directory = path.join(cwd, "src/features/public/components");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "fixture.tsx"), source);
    return spawnSync(
      process.execPath,
      ["--no-env-file", path.resolve("scripts/verify-public-a11y.ts")],
      {
        cwd,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

void test("a11y guard rejects a missing search label after an arrow callback", () => {
  const source = readFileSync(
    "src/features/public/components/server-offer-table.tsx",
    "utf8",
  );
  const labelled = runA11yFixture(source);
  assert.equal(labelled.status, 0, `${labelled.stdout}\n${labelled.stderr}`);
  const unlabelled = source.replace("aria-label={copy.searchLabel}", "");
  assert.notEqual(
    unlabelled,
    source,
    "The regression must remove the real search label",
  );
  const result = runA11yFixture(unlabelled);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /搜索框只有 placeholder，没有可访问名称/);
});

void test("a11y guard accepts associated labels and ignores label text on other nodes", () => {
  const hero = readFileSync(
    "src/features/public/components/hero-tag-search.tsx",
    "utf8",
  );
  const fixture =
    '<SelectTrigger onClick={() => {}} aria-label="Choose"><SelectValue /></SelectTrigger>;' +
    hero;
  const result = runA11yFixture(fixture);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const noAssociation = runA11yFixture(
    fixture.replace('htmlFor="hero-tag-search"', 'htmlFor="unrelated"'),
  );
  assert.equal(
    noAssociation.status,
    1,
    `${noAssociation.stdout}\n${noAssociation.stderr}`,
  );
  const fakeLabel = runA11yFixture(
    '<SelectTrigger title="aria-label"><span aria-label="Child" /></SelectTrigger>',
  );
  assert.equal(fakeLabel.status, 1, `${fakeLabel.stdout}\n${fakeLabel.stderr}`);
});

void test("public links open new tabs in SSR and preserve anchor and affiliate behavior", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as cheerio from "cheerio";
import {mock} from "bun:test";
mock.module("next/navigation", () => ({usePathname:()=>"/posts",useSearchParams:()=>new URLSearchParams()}));
const {default: PublicLink, PublicAnchor} = await import("./src/features/public/components/public-link.tsx");
const {PaginationComponent} = await import("./src/features/shared/components/pagination.tsx");
const {openPublicContentLinksInNewTabs} = await import("./src/features/public/lib/content-link-targets.ts");
function anchor(Component, props) {return cheerio.load(renderToStaticMarkup(React.createElement(Component, props, "Link")))("a");}
for (const Component of [PublicLink, PublicAnchor]) {
  for (const href of ["/fwq/posts/example", "/en/fwq/posts/example", "/servers?provider=one#inventory-results", "https://example.test/buy?pid=1&aff=2", "/go/merchant"]) {
    const a = anchor(Component, {href,rel:"nofollow sponsored"});
    assert.equal(a.attr("href"), href);
    assert.equal(a.attr("target"), "_blank");
    assert.deepEqual(new Set(a.attr("rel").split(" ")), new Set(["nofollow","sponsored","noopener","noreferrer"]));
  }
  for (const href of ["#main-content", "mailto:contact@example.test", "tel:+123456"]) {
    assert.equal(anchor(Component, {href}).attr("target"), undefined, href);
  }
}
assert.equal(anchor(PublicLink, {href:{pathname:"/en/fwq/page/2",query:{sort:"new"}}}).attr("target"), "_blank");
assert.equal(anchor(PublicLink, {href:{hash:"section"}}).attr("target"), undefined);
for (const language of ["zh", "en"]) {
  const $=cheerio.load(renderToStaticMarkup(React.createElement(PaginationComponent,{pageNo:2,totalPage:4,basePath:language==="en"?"/en/fwq":"/fwq",language,newTab:true})));
  assert.ok($("a").length>0);
  $("a").each((_,a)=>assert.equal($(a).attr("target"),"_blank"));
}
const cms=cheerio.load(renderToStaticMarkup(React.createElement(PaginationComponent,{pageNo:2,totalPage:4})));
cms("a").each((_,a)=>assert.equal(cms(a).attr("target"),undefined,"CMS keeps existing pagination behavior"));
const html='<h2 id="section">Section</h2><a href="#section">TOC</a><a href="/fwq/tags/cn2-gia/page/1" data-internal-link="tag:1">CN2</a><table><tr><td><a href="/go/deal-a?pid=1&amp;aff=2" rel="nofollow sponsored">Buy A</a></td><td><a href="https://example.test/buy?pid=2&amp;aff=2" rel="nofollow">Buy B</a></td></tr></table>';
const before=cheerio.load(html), after=cheerio.load(openPublicContentLinksInNewTabs(html));
assert.deepEqual(after("a").map((_,a)=>after(a).attr("href")).get(),before("a").map((_,a)=>before(a).attr("href")).get());
assert.equal(after('a[href="#section"]').attr("target"),undefined);
assert.equal(after("[data-internal-link]").attr("target"),"_blank");
after("td a").each((_,a)=>{assert.equal(after(a).attr("target"),"_blank");assert.ok(after(a).attr("rel").includes("nofollow"));});
assert.equal(after("table tr").length,1);
`,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

void test("public routes use the shared link policy including pagination and body HTML", () => {
  const root = "src/features/public";
  function visit(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(file) : [file];
    });
  }
  for (const file of visit(root).filter(
    (file) => file.endsWith(".tsx") && !file.endsWith("/public-link.tsx"),
  )) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      !source.includes('from "next/link"'),
      `${file}: use the public link component`,
    );
    assert.ok(
      !/<a\b/.test(source),
      `${file}: native links must use PublicAnchor`,
    );
    for (const match of source.matchAll(
      /<PaginationComponent\b([\s\S]*?)\/>/g,
    )) {
      assert.match(
        match[1] ?? "",
        /\bnewTab\b/,
        `${file}: public pagination must open new tabs`,
      );
    }
  }
  for (const file of [
    "src/features/public/lib/article-presentation.ts",
    "src/features/public/routes/knowledge/[slug]/page.tsx",
  ]) {
    assert.ok(
      readFileSync(file, "utf8").includes("openPublicContentLinksInNewTabs("),
      `${file}: rendered content links need the public policy`,
    );
  }
});
