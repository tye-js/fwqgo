import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function run(input: string) {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    input,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

void test("pagination keeps static paths independent of URL data and suspends query links safely", () =>
  run(String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {mock} from "bun:test";
let pending=true,reads=0;
const never=new Promise(()=>{});
mock.module("next/navigation",()=>({
 usePathname(){reads++;if(pending)throw never;return "/knowledge";},
 useSearchParams(){reads++;if(pending)throw never;return new URLSearchParams("category=network&q=CN2&page=2");}
}));
const {PaginationComponent}=await import("./src/features/shared/components/pagination.tsx");
function render(props){return load(renderToStaticMarkup(React.createElement(PaginationComponent,props)));}
for(const basePath of ["/fwq","/en/fwq"]){
 const $=render({basePath,pageNo:2,totalPage:4,newTab:true});
 assert.ok($('a[href="'+basePath+'/page/3"]').length);
 assert.equal($('a[aria-current="page"]').text(),"2");
 assert.equal($('a[href="'+basePath+'/page/3"]').first().attr("target"),"_blank");
}
assert.equal(render({pageNo:1,totalPage:1})("nav").length,0);
assert.equal(reads,0,"Static and single-page pagination must never read URL data");
const fallback=render({pageNo:2,totalPage:4,queryParam:"page"});
assert.equal(fallback('nav[aria-busy="true"]').length,1);
assert.equal(fallback("a[href]").length,0,"Do not invent query links while URL is unavailable");
assert.equal(fallback('[aria-current="page"]').length,0);
pending=false;
const resolved=render({pageNo:2,totalPage:4,queryParam:"page",newTab:true});
assert.ok(resolved('a[href="/knowledge?category=network&q=CN2&page=3"]').length);
assert.equal(resolved('nav[aria-busy="true"]').length,0);
const cms=render({pageNo:2,totalPage:4});
assert.ok(cms('a[href="/knowledge?category=network&q=CN2&page=2&pageNo=3"]').length);
assert.equal(cms('a[target="_blank"]').length,0);
`));

void test("server navigation renders destinations without reading incomplete route params", () =>
  run(String.raw`
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {mock} from "bun:test";
let reads=0;
mock.module("next/navigation",()=>({usePathname(){reads++;throw new Error("URL unavailable during fallback prerender");}}));
const {ActiveNavLink,ActiveNavGroup}=await import("./src/features/public/components/active-nav-link.tsx");
const item=React.createElement(ActiveNavLink,{link:{href:"/knowledge",label:"知识库",matchPrefixes:["/knowledge"]},className:"normal",activeClassName:"active"});
const group=React.createElement(ActiveNavGroup,{title:"浏览",prefixes:["/knowledge"],summaryClassName:"normal",activeClassName:"active",panelClassName:"panel"},item);
const $=load(renderToStaticMarkup(group));
assert.equal(reads,0);
assert.equal($('a[href="/knowledge"]').length,1);
assert.equal($("summary").text(),"浏览");
assert.equal($('[aria-current="page"]').length,0);
assert.equal($("details[open]").length,0);
`));

void test("inventory filter responses remain noindex and private with static metadata", () =>
  run(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {NextRequest} from "next/server";
mock.module("@/server/seo/public-route-guard",()=>({resolvePublicResourcePath(){throw new Error("Inventory must not query the content guard");}}));
const {proxy}=await import("./apps/web/proxy.ts");
const base="https://fwqgo.com";
const index=await proxy(new NextRequest(base+"/servers"));
assert.equal(index.headers.get("X-Robots-Tag"),null);
assert.equal(index.headers.get("X-Fwqgo-Cacheable-Public"),"1");
for(const method of ["GET","HEAD"]){
 for(const query of ["?q=CN2","?sort=price-desc&maxPrice=3","?cursor=next","?q="]){
  const response=await proxy(new NextRequest(base+"/servers"+query,{method}));
  assert.equal(response.headers.get("X-Robots-Tag"),"noindex, follow");
  assert.equal(response.headers.get("X-Fwqgo-Cacheable-Public"),null);
  assert.match(response.headers.get("Cache-Control"),/private, no-store/);
 }
}
for(const headers of [{RSC:"1"},{"Next-Router-Prefetch":"1"},{cookie:"session=test"}]){
 const response=await proxy(new NextRequest(base+"/servers",{headers}));
 assert.equal(response.headers.get("X-Fwqgo-Cacheable-Public"),null);
}
`));

void test("navigation hydrates its highlight and keeps dismissal after route changes", () =>
  run(String.raw`
import assert from "node:assert/strict";
import React, {act} from "react";
import {renderToString} from "react-dom/server";
import {hydrateRoot} from "react-dom/client";
import {Window} from "happy-dom";
import {mock} from "bun:test";
let pathname="/knowledge",reads=0;
mock.module("next/navigation",()=>({usePathname(){reads++;return pathname;}}));
mock.module("next/link",()=>({default:React.forwardRef(({prefetch,children,...props},ref)=>React.createElement("a",{...props,ref},children))}));
const {ActiveNavLink,ActiveNavGroup}=await import("./src/features/public/components/active-nav-link.tsx");
function tree(){
 const item=React.createElement(ActiveNavLink,{link:{href:"/knowledge",label:"知识库",matchPrefixes:["/knowledge"]},className:"normal",activeClassName:"active"});
 return React.createElement(ActiveNavGroup,{title:"浏览",prefixes:["/knowledge"],summaryClassName:"normal",activeClassName:"active",panelClassName:"panel"},item);
}
const html=renderToString(tree());
assert.equal(reads,0);
const window=new Window({url:"http://localhost/knowledge"});
Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
const container=window.document.createElement("div");
container.innerHTML=html;window.document.body.append(container);
const errors=[];
let root;
await act(async()=>{root=hydrateRoot(container,tree(),{onRecoverableError:error=>errors.push(String(error))});});
assert.ok(reads>0);
assert.equal(container.querySelector("a").getAttribute("aria-current"),"page");
assert.equal(container.querySelector("summary").getAttribute("aria-current"),"page");
let details=container.querySelector("details");details.open=true;
await act(async()=>{window.document.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));});
assert.equal(details.open,false);
details.open=true;pathname="/servers";
await act(async()=>{root.render(tree());});
assert.equal(container.querySelector("a").getAttribute("aria-current"),null);
assert.equal(container.querySelector("details").open,false);
assert.deepEqual(errors,[]);
await act(async()=>{root.unmount();});
await window.happyDOM.abort();
`));

void test("homepage caches fit the app shell without changing server revalidation", () => {
  for (const route of ["page.tsx", "en/page.tsx"]) {
    const source = readFileSync(`src/features/public/routes/${route}`, "utf8");
    assert.match(
      source,
      /cacheLife\(\{ stale: 300, revalidate: 300, expire: 3_600 \}\)/,
    );
  }
  for (const language of ["zh", "en"]) {
    const layout = readFileSync(
      `apps/web/app/(${language})/layout.tsx`,
      "utf8",
    );
    assert.doesNotMatch(layout, /instant\s*=\s*false/);
  }
});
