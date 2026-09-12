import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { isSameOriginRequest } from "../packages/core/same-origin-request";
import { versionUploadImageReferences } from "../packages/core/upload-image-version";

// These regressions run application functions against in-memory fixtures only.
// Database, password verification, sessions and cache side effects are mocked.
function isolated(source: string) {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/unused",
      CMS_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/unused",
      READ_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/unused",
      ANALYTICS_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/unused",
      NEXT_PUBLIC_URL: "https://example.test",
      NEXT_PUBLIC_CMS_URL: "https://cms.example.test",
    },
    input: source,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

void test("CMS cookie mutations reject missing, foreign and sibling origins", () => {
  for (const [origin, site, expected] of [
    ["https://cms.example.test", "same-origin", true],
    ["http://127.0.0.1:3100", "same-origin", true],
    ["https://cms.example.test", "cross-site", false],
    ["https://example.test", "same-site", false],
    ["https://untrusted.test", "cross-site", false],
    ["null", "cross-site", false],
    ["", "", false],
    ["https://cms.example.test@untrusted.test", "", false],
  ] as const) {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    if (site) headers.set("sec-fetch-site", site);
    assert.equal(
      isSameOriginRequest(
        { url: "http://127.0.0.1:3100/api/upload", headers },
        "https://cms.example.test",
      ),
      expected,
    );
  }
});

void test("image versions replace old versions and preserve unrelated URLs and parameters", () => {
  const update = (value: string) =>
    versionUploadImageReferences(
      value,
      "/uploads/a.webp",
      "newhash",
      "https://example.test",
    );
  assert.equal(update("/uploads/a.webp"), "/uploads/a.webp?v=newhash");
  assert.equal(
    update("![cover](/uploads/a.webp?size=2&v=old#figure)"),
    "![cover](/uploads/a.webp?size=2&v=newhash#figure)",
  );
  assert.equal(
    update(
      '<img src="https://example.test/uploads/a.webp?v=old&amp;width=20">',
    ),
    '<img src="https://example.test/uploads/a.webp?v=newhash&amp;width=20">',
  );
  for (const value of [
    "https://untrusted.test/uploads/a.webp",
    "/uploads/a.webp-other",
    "/other/uploads/a.webp",
    "/uploads/b.webp",
  ])
    assert.equal(update(value), value);
  assert.equal(update(update("/uploads/a.webp")), update("/uploads/a.webp"));
});

void test("login reserves the account quota before concurrent password verification", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";
let release;
const gate = new Promise(resolve => { release = resolve; });
const fixture = {comparisons: 0, gate};
const user={id:"fixture",username:"fixture-admin",password:"unused",role:"admin",status:"active"};
const q={from:()=>q,where:()=>q,limit:async()=>[user]};
mock.module("bcryptjs", () => ({async compare() {fixture.comparisons++;await fixture.gate;return false;}}));
mock.module("@fwqgo/db", () => ({db: {select:()=>q}}));
mock.module("@fwqgo/auth/session-store", () => ({async createCmsSession() {throw new Error("Unexpected session write");}}));
const { POST } = await import("./src/features/cms/routes/api/auth/login/route.ts");
const request = () => new Request("https://cms.example.test/api/auth/login",{method:"POST",headers:{origin:"https://cms.example.test","content-type":"application/json","x-real-ip":"203.0.113.9"},body:JSON.stringify({username:"fixture-admin",password:"fixture-wrong"})});
const pending=Array.from({length:32},()=>POST(request()));
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(fixture.comparisons,8);
release();
const responses=await Promise.all(pending);
assert.equal(responses.filter(response=>response.status===401).length,8);
assert.equal(responses.filter(response=>response.status===429).length,24);
assert.equal((await POST(request())).status,429);
`);
});

void test("article creation reuses its transaction for merchant and short-link queries", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";
const db={select() {throw new Error("Unexpected extra pooled connection");}};
mock.module("@fwqgo/db", () => ({db,readDb:db}));
mock.module("@/server/images/assets", () => ({async syncImageReferencesForPost() {}}));
mock.module("@/server/cache/public-revalidation-client", () => ({schedulePublicWebCache() {}}));
const {createPostRecordInTransaction}=await import("./src/server/posts/create-post-record.ts");
const provider={officialUrl:"https://merchant.example",affUrl:"https://merchant.example/?aff=42",affParam:"aff",affValue:"42"};
let merchantReads=0;
const tx={
 select(){let name;const rows=()=>{if(name==="categories")return [{id:1,slug:"category"}];if(name==="aff_service_providers"){merchantReads++;return [provider];}if(name==="outbound_links")return [{id:1,slug:"fixture-link"}];return [];};const q={from(t){name=t[Symbol.for("drizzle:Name")];return q;},where:()=>q,limit:()=>q,then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;},
 insert(){let values;const q={values(v){values=v;return q;},onConflictDoNothing:()=>q,returning:async()=>[{...values,id:1}]};return q;},
};
const result=await createPostRecordInTransaction({title:"Fixture article",description:"Fixture description",categoryId:1,published:false,content:"[buy](https://merchant.example/product?pid=4&aff=old) [another](https://merchant.example/product?pid=5&aff=old)"},tx);
assert.equal(result.error,undefined);
assert.match(result.data.content,/\/go\/fixture-link/);
assert.equal(merchantReads,1);
`);
});

void test("post edits roll back together, preserve published content and reject stale versions", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";
const original={id:1,title:"Old title",slug:"old-slug",content:"Old approved prose. ".repeat(20),description:"Old description",categoryId:1,published:true,slugLocked:true,language:"zh",affiliateReviewStatus:"passed",affiliateReviewDetails:null,updatedAt:new Date("2026-01-01T00:00:00.000Z"),translationSourcePostId:null};
const fixture={post:structuredClone(original),tags:[{postId:1,tagId:8}],failTags:true,invalidLinks:[],cacheCalls:0,commits:0,authorized:true};
const name=t=>t[Symbol.for("drizzle:Name")];
const tx={
 select(projection){let table;const rows=()=>{if(table==="posts")return projection && Object.keys(projection).join()==="id"?[]:[structuredClone(fixture.post)];if(table==="categories")return [{id:1}];if(table==="tags")return [{id:9,name:"Tag",slug:"tag",enName:"Tag"}];return [];};const q={from(t){table=name(t);return q;},where:()=>q,limit:()=>q,for:()=>q,then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;},
 delete(){return {where:async()=>{fixture.tags=[];}};},
 insert(t){let values;const execute=()=>{if(name(t)==="post_tags"){if(fixture.failTags)throw new Error("Sensitive database parameter fixture");fixture.tags=values;}return [];};const q={values(v){values=v;return q;},onConflictDoNothing:()=>q,then(resolve,reject){return Promise.resolve().then(execute).then(resolve,reject);}};return q;},
 update(){let values;const q={set(v){values=v;return q;},where:()=>q,returning:async()=>{fixture.post={...fixture.post,...values};return [structuredClone(fixture.post)];}};return q;},
 execute:async()=>{},
};
fixture.db={transaction:async(work)=>{const before=structuredClone({post:fixture.post,tags:fixture.tags});try{const result=await work(tx);fixture.commits++;return result;}catch(error){fixture.post=before.post;fixture.tags=before.tags;throw error;}}};
class Unauthorized extends Error {}
const touch=()=>{fixture.cacheCalls++;};
mock.module("@fwqgo/db", () => ({db: fixture.db}));
mock.module("@fwqgo/auth/session", () => ({
  async requireAdminSession() {if(!fixture.authorized)throw new Unauthorized();return {userId:"fixture"};},
  isUnauthorizedError: error=>error instanceof Unauthorized,
}));
mock.module("next/cache", () => ({revalidatePath:touch,revalidateTag:touch,updateTag:touch,cacheTag:touch}));
mock.module("@/server/images/assets", () => ({async syncImageReferencesForPost() {},async deleteImageReferencesForPosts() {}}));
mock.module("@/server/posts/create-post-record", () => ({
  async prepareArticleContentForStorage(content) {return content;},
  async createPostRecord() {throw new Error("Unexpected create");},
  getErrorMessage:error=>error.message,
}));
mock.module("@/server/links/affiliate-link-rewriter", () => ({
  async rewriteAffiliateLinks() {return {invalidLinks:fixture.invalidLinks,matchedLinks:[],unmatchedLinks:[],totalLinks:0,internalLinksRemoved:0};},
}));
mock.module("@/server/cache/public-revalidation-client", () => ({schedulePublicWebCache:touch}));
mock.module("@/server/posts/internal-links", () => ({async markPostInternalLinksStale() {}}));
const {savePostEdits}=await import("./src/features/cms/actions/post.ts");
const input={id:1,title:"New title",slug:"old-slug",description:"New description",content:"New reviewed prose. ".repeat(20),published:true,categoryId:1,recommendTagName:"",keywords:"",newTags:[{tag:{id:9,name:"Tag",slug:"tag"}}],expectedUpdatedAt:original.updatedAt.toISOString()};
const failed=await savePostEdits(input);
assert.equal(failed.status,500);
assert.doesNotMatch(failed.message,/Sensitive/);
assert.deepEqual(fixture.post,original);
assert.deepEqual(fixture.tags,[{postId:1,tagId:8}]);
assert.equal(fixture.cacheCalls,0);
assert.equal(fixture.commits,0);
fixture.failTags=false;
fixture.invalidLinks=[{host:"invalid.example"}];
assert.equal((await savePostEdits(input)).status,400);
assert.deepEqual(fixture.post,original);
assert.equal(fixture.cacheCalls,0);
fixture.invalidLinks=[];
const saved=await savePostEdits(input);
assert.equal(saved.success,true);
assert.equal(fixture.post.content,input.content.trim());
assert.equal(fixture.post.title,input.title);
assert.equal(fixture.post.published,true);
assert.equal(fixture.post.affiliateReviewStatus,"passed");
assert.deepEqual(fixture.tags,[{postId:1,tagId:9}]);
assert.equal(fixture.commits,1);
assert.ok(fixture.cacheCalls>0);
assert.equal((await savePostEdits(input)).status,409);
fixture.authorized=false;
assert.equal((await savePostEdits(input)).status,401);
`);
});

void test("topic database failures remain errors instead of cacheable empty inventories", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";
const db={select() {throw new Error("Fixture database unavailable");}};
mock.module("@fwqgo/db", () => ({db,readDb:db}));
mock.module("next/cache", () => ({cacheLife() {},cacheTag() {},revalidatePath() {},revalidateTag() {},updateTag() {},unstable_cache:fn=>fn}));
const {getServerOfferTopic}=await import("./src/server/offers/server-offers.ts");
assert.equal(await getServerOfferTopic("missing-topic"),null);
await assert.rejects(getServerOfferTopic("hong-kong"),error=>error.cause?.message==="Fixture database unavailable");
`);
});

void test("image replacement versions published references and rolls files back on database failure", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";
import {mkdtemp,writeFile,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
const directory=await mkdtemp(join(tmpdir(),"fwqgo-audit-image-"));
process.env.UPLOAD_DIR=directory;
const make=color=>sharp({create:{width:2,height:2,channels:4,background:color}}).webp().toBuffer();
const originalBuffer=await make("red");
const replacementBuffer=await make("blue");
const originalAsset={id:1,path:"/uploads/fixture.webp",thumbPath:null,largePath:null,hash:createHash("sha256").update(originalBuffer).digest("hex"),mime:"image/webp"};
const originalPost={id:1,imgUrl:originalAsset.path,content:'<p><img src="/uploads/fixture.webp"></p>'};
const fixture={asset:structuredClone(originalAsset),post:structuredClone(originalPost),knowledge:{id:2,content:originalPost.content},failPosts:true};
const name=t=>t[Symbol.for("drizzle:Name")];
const tx={
 select(){let table;const rows=()=>table==="image_assets"?[structuredClone(fixture.asset)]:table==="posts"?[structuredClone(fixture.post)]:table==="knowledge_articles"?[structuredClone(fixture.knowledge)]:[];const q={from(t){table=name(t);return q;},where:()=>q,limit:()=>q,for:()=>q,orderBy:()=>q,then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;},
 update(t){let values;const execute=()=>{if(name(t)==="image_assets"){fixture.asset={...fixture.asset,...values};return [structuredClone(fixture.asset)];}if(name(t)==="posts"){if(fixture.failPosts)throw new Error("Fixture reference update failed");fixture.post={...fixture.post,...values};}if(name(t)==="knowledge_articles")fixture.knowledge={...fixture.knowledge,...values};return [];};const q={set(v){values=v;return q;},where:()=>q,returning:async()=>execute(),then(resolve,reject){return Promise.resolve().then(execute).then(resolve,reject);}};return q;},
};
fixture.db={transaction:async(work)=>{const before=structuredClone({asset:fixture.asset,post:fixture.post});try{return await work(tx);}catch(error){fixture.asset=before.asset;fixture.post=before.post;throw error;}}};
mock.module("@fwqgo/db", () => ({db: fixture.db}));
try {
 await writeFile(join(directory,"fixture.webp"),originalBuffer);
 const {replaceImageAssetFile}=await import("./src/server/images/assets.ts");
 const input={id:1,file:new File([replacementBuffer],"replacement.webp",{type:"image/webp"})};
 await assert.rejects(replaceImageAssetFile(input),/Fixture reference update failed/);
 assert.deepEqual(await readFile(join(directory,"fixture.webp")),originalBuffer);
 assert.deepEqual(fixture.asset,originalAsset);
 assert.deepEqual(fixture.post,originalPost);
 assert.deepEqual(await readdir(directory),["fixture.webp"]);
 fixture.failPosts=false;
 const updated=await replaceImageAssetFile(input);
 assert.equal(updated.path,originalAsset.path);
 const hash=createHash("sha256").update(await readFile(join(directory,"fixture.webp"))).digest("hex");
 assert.equal(updated.hash,hash);
 assert.equal(fixture.post.imgUrl,originalAsset.path+"?v="+hash.slice(0,16));
 assert.match(fixture.post.content,new RegExp("v="+hash.slice(0,16)));
 assert.match(fixture.knowledge.content,new RegExp("v="+hash.slice(0,16)));
 assert.match(updated.thumbPath,/_thumb-[a-f0-9]{16}\.webp$/);
 assert.match(updated.largePath,/_large-[a-f0-9]{16}\.webp$/);
} finally { await rm(directory,{recursive:true,force:true}); }
`);
});
