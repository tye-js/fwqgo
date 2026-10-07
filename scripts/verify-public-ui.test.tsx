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

void test("homepage renders an ordered bilingual feed, qualified topics, distinct picks and existing promotion placements", () => {
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
const posts=Array.from({length:13},(_,i)=>({id:i+1,title:"Server guide "+(i+1),slug:"guide-"+(i+1),description:i===0?null:"A saved description.",imgUrl:"/uploads/example.webp",createdAt:new Date("2026-09-01T00:00:00Z"),tags:[]}));
for(const language of ["zh","en"]){
 const prefix=language==="en"?"/en":"";
 const topics={regions:[{label:language==="en"?"Hong Kong, China":"中国香港",href:prefix+"/fwq/"+(language==="en"?"hong-kong-vps":"hk-vps")+"/page/1"}],lines:[{label:"CN2 GIA",href:prefix+"/fwq/tags/cn2-gia/page/1"}]};
 const props={language,posts:[posts[0],...posts],sidebarData:{promotedPosts:[],editorPicks:[posts[0],posts[9],posts[9],...posts.slice(10)]},homepageSlots:[],topics};
 const html=renderToStaticMarkup(React.createElement(PublicHomePage,props));const $=cheerio.load(html);
 assert.equal($("main#main-content").length,1);assert.equal($("h1").length,1);
 assert.deepEqual($("[data-testid=home-feed] h3").toArray().map(node=>$(node).text()),posts.slice(0,9).map(post=>post.title));
 assert.equal($("[data-variant=home-list]").length,9);
 assert.equal($("[data-testid=home-feed] img[loading=eager]").length,1);
 assert.equal($("[data-testid=home-feed] img[loading=lazy]").length,8);
 assert.equal($("[data-testid=home-feed] article").first().find("p").length,0);
 assert.deepEqual($("[data-testid=home-editor-picks] a").toArray().map(node=>$(node).attr("href")),posts.slice(9,12).map(post=>prefix+"/fwq/posts/"+post.slug));
 assert.deepEqual($("[data-testid=home-topics] a").toArray().map(node=>$(node).attr("href")),[topics.regions[0].href,topics.lines[0].href]);
 assert.ok(html.indexOf('data-testid="home-topics"')<html.indexOf('data-testid="home-feed"'));
 for(const href of [prefix+"/fwq/page/1",prefix+"/knowledge",prefix+"/tools/network-lines",prefix+"/tools/server-sizing"]){assert.ok($('a[href="'+href+'"]').length>0,href);}
 assert.equal($('main a[href="/servers"]').length,1);
 if(language==="en"){assert.equal($('a[href^="/fwq/"]').length,0);assert.equal($('input[name="lang"]').attr("value"),"en");assert.match($('a[href="/servers"]').text(),/Chinese/);}
 assert.ok(!html.includes("undefined"));assert.ok(!html.includes("NaN"));
 $("a[href]").each((_,a)=>{assert.equal($(a).attr("target"),"_blank");assert.equal($(a).find("a").length,0);});
 const empty=cheerio.load(renderToStaticMarkup(React.createElement(PublicHomePage,{...props,posts:[],sidebarData:{editorPicks:[],promotedPosts:[]},topics:{regions:[],lines:[]}})));
 assert.equal(empty("h1").length,1);assert.equal(empty("[data-testid=article-card]").length,0);assert.equal(empty("[data-testid=home-topics]").length,0);assert.equal(empty("[data-testid=home-editor-picks]").length,0);
 const overlap=cheerio.load(renderToStaticMarkup(React.createElement(PublicHomePage,{...props,sidebarData:{editorPicks:posts.slice(0,5),promotedPosts:[]}})));
 assert.equal(overlap("[data-testid=home-editor-picks]").length,0);
 const slots=["hero_primary",...Array(7).fill("sidebar"),...Array(7).fill("promo_grid"),"featured_offers"].map((placement,id)=>({id,placement,contentType:"image_link",resolvedTargetUrl:"https://example.com/promo-"+id,resolvedTitle:"Promotion "+id,resolvedImageUrl:null,resolvedDescription:null,resolvedAltText:""}));
 const promoted=cheerio.load(renderToStaticMarkup(React.createElement(PublicHomePage,{...props,homepageSlots:slots})));
 assert.equal(promoted('a[href^="https://example.com/promo-"]').length,13);
 assert.equal(promoted('[data-testid=home-sidebar-promotions] a').length,6);assert.equal(promoted('[data-testid=home-promotion-grid] a').length,6);
 assert.equal(promoted('a[href="https://example.com/promo-15"]').length,0);
 assert.ok(promoted('aside').text().includes(language==="en"?"Sponsored":"推广"));
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

void test("homepage topics batch exact entities and count the full public corpus separately per language", () => {
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
database.exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, slug TEXT, enSlug TEXT); CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, enName TEXT, enSlug TEXT, indexable INTEGER); CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, categoryId INTEGER, language TEXT, published INTEGER, content TEXT); CREATE TABLE post_tags (postId INTEGER, tagId INTEGER);');
for(const [id,slug,enSlug] of [[1,"hk-vps","hong-kong-vps"],[2,"usa-vps","us-vps"],[3,"jp-vps","japan-vps"],[4,"kr-vps","korea-vps"],[5,"fuwuqi","china-servers"]])database.run('INSERT INTO categories VALUES (?,?,?)',[id,slug,enSlug]);
for(const row of [[1,"CN2 GIA","cn2-gia","CN2 GIA","cn2-gia",1],[2,"CMI","cmi",null,null,1],[3,"CMIN2","cmin2","CMIN2","cmin2",0],[4,"AS9929","as9929","AS9929","as9929",1],[5,"CN2 GIA marketing","cn2-gia-marketing",null,null,1]])database.run('INSERT INTO tags VALUES (?,?,?,?,?,?)',row);
let nextId=1;
function put(categoryId,language,tagIds=[],overrides={}){
 const row={id:nextId++,title:"Saved title",slug:"article-"+nextId,categoryId,language,published:1,content:"Complete prose. ".repeat(40),...overrides};
 database.run('INSERT INTO posts VALUES (?,?,?,?,?,?,?)',Object.values(row));
 for(const tagId of tagIds)database.run('INSERT INTO post_tags VALUES (?,?)',[row.id,tagId]);
}
// Far more than nine articles: qualification must not be inferred from a feed.
for(const lang of ["zh","en"]){for(let i=0;i<3;i++)put(1,lang,[1,3,4]);for(let i=0;i<15;i++)put(2,lang,[5]);}
for(let i=0;i<3;i++)put(3,"zh",[2]);
for(let i=0;i<2;i++)put(3,"en",[2]);
for(let i=0;i<3;i++)put(4,"zh",[]);
for(let i=0;i<3;i++)put(5,"zh",[]);
for(const patch of [{published:0},{title:" "},{slug:" "},{content:"short"}])put(3,"en",[2],patch);
let statements=0,fail=false;const cacheTags=new Set();
const readDb=drizzle(async(query,params)=>{
 statements++;if(fail)throw new Error("Fixture database failure");
 return {rows:database.query(query.replaceAll("char_length(","length(").replaceAll("btrim(","trim(")).values(...params.map(value=>typeof value==="boolean"?Number(value):value))};
});
mock.module("@fwqgo/db",()=>({readDb}));
mock.module("next/cache",()=>({cacheLife(){},cacheTag(...tags){tags.forEach(tag=>cacheTags.add(tag));},revalidatePath(){},revalidateTag(){},updateTag(){}}));
const {getHomepageTopics}=await import("./src/features/public/data/homepage-topics.ts");
try{
 const zh=await getHomepageTopics("zh");assert.equal(statements,4,"Two entity reads plus two grouped corpus counts");
 assert.deepEqual(zh.regions.map(x=>x.href),["hk-vps","usa-vps","jp-vps","kr-vps"].map(slug=>"/fwq/"+slug+"/page/1"));
 assert.equal(zh.regions[0].label,"中国香港");assert.deepEqual(zh.lines.map(x=>x.label),["CN2 GIA","CMI","AS9929"]);
 const en=await getHomepageTopics("en");assert.equal(statements,8);
 assert.deepEqual(en.regions.map(x=>x.href),["/en/fwq/hong-kong-vps/page/1","/en/fwq/us-vps/page/1"]);
 assert.equal(en.regions[0].label,"Hong Kong, China");assert.deepEqual(en.lines.map(x=>x.href),["/en/fwq/tags/cn2-gia/page/1","/en/fwq/tags/as9929/page/1"]);
 database.run('UPDATE tags SET name=?,enName=NULL,enSlug=NULL WHERE id=4',["中文线路"]);
 assert.equal((await getHomepageTopics("en")).lines.length,1,"Missing English identity must not leak Chinese labels");
 for(const tag of ["homepage","posts","categories","tags"])assert.ok(cacheTags.has(tag),tag);
 database.exec('DELETE FROM posts;');assert.deepEqual(await getHomepageTopics("zh"),{regions:[],lines:[]});
 fail=true;await assert.rejects(getHomepageTopics("zh"),"Database failures must propagate");
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
 for(const variant of ["feature","list","compact","home-list"]){
  const $=cheerio.load(renderToStaticMarkup(React.createElement(ArticleCard,{post,language,variant}))),prefix=language==="en"?"/en":"";
  assert.ok($('a[href="'+prefix+'/fwq/tags/cn2-gia/page/1"]').length>0);
  assert.equal($('a[href*="private-topic"]').length,0);
  assert.equal($("img").attr("loading"),variant==="feature"?"eager":"lazy");
  assert.equal($("img").attr("alt"),"Article");
  if(variant==="home-list"){
   assert.equal($("img").attr("sizes"),"(max-width: 639px) 80px, 144px");
   assert.equal($("time").length,1);
   const sparse=cheerio.load(renderToStaticMarkup(React.createElement(ArticleCard,{post:{...post,description:null,imgUrl:null,createdAt:"bad date",tags:[{tag:{id:9,name:"Missing slug",slug:" ",publiclyIndexable:true}}]},language,variant})));
   assert.equal(sparse("time").length,0);assert.equal(sparse("p").length,0);assert.equal(sparse('a[href*="/tags/"]').length,0);assert.equal(sparse("svg").length,1);
  }
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
