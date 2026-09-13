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
const props={posts,sidebarData:{promotedPosts:[],popularPosts:[]},latestOffers:[],offerCounts:[{slug:"hong-kong",count:7}],totalOfferCount:7,homepageSlots:[],collections:{providers:[],regions:[],lines:[]},knowledge:[]};
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
}
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
