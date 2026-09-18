import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
