import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function isolated(source: string) {
  const database = "postgresql://fixture:fixture@127.0.0.1:1/unused";
  const result = spawnSync(
    process.execPath,
    ["--no-env-file", "--conditions=react-server", "-"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: database,
        CMS_DATABASE_URL: database,
        READ_DATABASE_URL: database,
        ANALYTICS_DATABASE_URL: database,
        NEXT_PUBLIC_URL: "https://example.test",
        NEXT_PUBLIC_CMS_URL: "https://cms.example.test",
        ENABLE_CMS_BACKGROUND_WORKERS: "false",
      },
      input: source,
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
}

void test("collection preserves full source, rewrites merchant parameters once and keeps href replacement", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import * as originalNetwork from "./packages/core/network-url.ts";
const network={...originalNetwork};
const paragraph="This is the complete original article about a VPS offer. ".repeat(700);
const urls=["https://merchant.example/buy?pid=1&affid=23&coupon=one","https://merchant.example/buy?pid=2&affid=23&coupon=two"];
const html='<html><head><title>Original title</title></head><body><article><h1>Original title</h1><p>'+paragraph+'</p><table><tr><th>Plan</th><th>Buy</th></tr><tr><td>A</td><td><a href="'+urls[0]+'">Buy A</a></td></tr><tr><td>B</td><td><a href="'+urls[1]+'">Buy B</a></td></tr></table><p><a href="https://example.com/go/offer">Redirected plan</a></p><p>COMPLETE SOURCE END</p></article></body></html>';
const provider={id:3,name:"Merchant",officialUrl:"https://merchant.example",affUrl:"https://merchant.example/?affid=33",affParam:"affid",affValue:"33"};
let providerReads=0;
mock.module("@fwqgo/db",()=>({db:{select(){return {from:async()=>{providerReads++;return [provider];}};}}}));
mock.module("@fwqgo/core/network-url",()=>({...network,fetchPublicHttpUrl:async(url,options)=>options?.method==="HEAD"?{url:"https://merchant.example/buy?pid=3&affid=23"}:new Response(html,{headers:{"content-type":"text/html"}})}));
mock.module("@/langchain/rewrite-article",()=>({default:()=>{throw new Error("Unexpected text AI request");}}));
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfig:()=>{throw new Error("Unexpected AI configuration lookup");}}));
const {scrapeArticleWithOptions}=await import("./src/server/scrape/article-scraper.ts");
const article=await scrapeArticleWithOptions({url:"https://example.com/article"});
assert.equal(providerReads,1);assert.equal(article.title,"Original title");assert.equal(article.diagnostics.usedAiRewrite,false);
assert.ok(article.htmlContent.length>30000);assert.ok(article.htmlContent.includes("COMPLETE SOURCE END"));
for (const [index,url] of urls.entries()) {
 assert.ok(article.htmlContent.includes(url.replace("affid=23","affid=33")),"Each plan keeps its own purchase URL");
 assert.equal(article.diagnostics.affiliateReport.matchedLinks[index].originalHref,url);
}
assert.ok(article.htmlContent.includes("https://merchant.example/buy?pid=3&affid=33"));assert.ok(!article.cleanedHtmlContent.includes("/go/offer"));assert.ok(article.cleanedHtmlContent.includes("pid=3"));
assert.ok(article.cleanedHtmlContent.includes("affid=23"));assert.ok(!article.cleanedHtmlContent.includes("affid=33"));
provider.affParam="href";provider.affUrl="https://merchant.example/special-offer?ref=ours";
const replacement=await scrapeArticleWithOptions({url:"https://example.com/article"});
assert.equal(providerReads,2);assert.equal(replacement.diagnostics.affiliateReport.matchedLinks.length,3);
for (const match of replacement.diagnostics.affiliateReport.matchedLinks) {assert.equal(match.mode,"replace");assert.equal(match.finalHref,provider.affUrl);}
`);
});

void test("collection goes directly to drafts and only explicitly requested English translations start AI", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
const dialect=new PgDialect(),name=table=>table[Symbol.for("drizzle:Name")];
const f={task:null,steps:[],saved:[],fetches:0,allowTranslation:false,translations:0};
const report={totalLinks:0,matchedLinks:[],unmatchedLinks:[],invalidLinks:[],internalLinksRemoved:0};
const db={
 async transaction(work){return work(db);},
 select(){let table,condition;const q={from(t){table=name(t);return q;},where(c){condition=c;return q;},limit:async()=>table==="posts"&&!dialect.sqlToQuery(condition).sql.includes('"translationSourcePostId"')?[{id:20,title:"Chinese source",content:"中文原文保持不变",language:"zh"}]:[]};return q;},
 update(table){let values,condition;const apply=()=>{assert.notEqual(name(table),"posts");if(name(table)!=="ai_rewrite_tasks")return [];const query=dialect.sqlToQuery(condition);if(query.sql.includes('"status" in')&&!query.params.includes(f.task.status))return [];if(query.sql.includes('"leaseOwner" =')&&!query.params.includes(f.task.leaseOwner))return [];f.task={...f.task,...values,attempts:typeof values.attempts==="object"?f.task.attempts+1:(values.attempts??f.task.attempts)};return [structuredClone(f.task)];};const q={set(v){values=v;return q;},where(c){condition=c;return q;},returning:async()=>apply(),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};return q;},
 insert(table){assert.equal(name(table),"ai_task_steps");return {values(values){return {onConflictDoUpdate:async()=>{f.steps.push(values);}};}};},
};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@/server/admin/background-jobs",()=>({enqueueAdminBackgroundJob:async()=>{}}));
mock.module("@/server/links/affiliate-link-rewriter",()=>({rewriteAffiliateLinks:async()=>report}));
mock.module("@/server/posts/collected-article-draft",()=>({saveCollectedArticleDraft:async(task,article)=>{assert.ok(f.steps.some(s=>s.stepKey==="html_clean"));assert.ok(f.steps.some(s=>s.stepKey==="affiliate_check"));f.saved.push(article);f.task={...f.task,status:"succeeded",postId:42,leaseOwner:null};}}));
mock.module("@/server/ai/english-translation-task",()=>({EnglishTranslationTaskError:class extends Error {},runEnglishTranslationTask:async(task,source,signal)=>{assert.equal(f.allowTranslation,true,"Legacy and collection tasks must not start translation");assert.equal(source.sourcePostId,20);assert.equal(signal.aborted,false);f.translations++;f.task={...f.task,status:"succeeded",postId:43,leaseOwner:null};}}));
mock.module("@/server/images/cover-generation-task-runner",()=>({enqueueArticleCoverGenerationTask:()=>{throw new Error("Cover requires an explicit click");}}));
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfig:()=>{throw new Error("Unexpected AI configuration lookup");}}));
mock.module("@/server/scrape/article-scraper",()=>({scrapeArticleWithOptions:async()=>{f.fetches++;return {title:"Source",description:"",content:"Original body",htmlContent:"Original body",cleanedHtmlContent:"<p>Original body</p>",keywords:[],tagsName:[],recommendTagName:"",diagnostics:{usedAiRewrite:false,affiliateReport:report}};}}));
const {runAiRewriteTask}=await import("./src/server/ai/rewrite-task-runner.ts");
for(const type of ["url","text","email","file","english","seo"]) {
 f.task={id:1,sourceType:type,sourceUrl:type==="english"?"post://20/english":"https://example.com/source",sourceTitle:"Original source",sourceContent:"A complete manual source paragraph. ".repeat(700)+"SOURCE END",postId:type==="seo"||type==="english"?20:null,sourceMaterialId:null,status:"pending",attempts:0,leaseOwner:null,createdAt:new Date()};f.steps=[];f.saved=[];
 await runAiRewriteTask(1);
 const legacy=["english","seo"].includes(type);
 assert.equal(f.task.status,type==="english"?"manual_required":type==="seo"?"cancelled":"succeeded",type);
 assert.equal(f.saved.length,legacy?0:1);
 assert.equal(f.steps.some(step=>step.stepKey==="manual_input"),type==="english");
 if(!legacy) {assert.ok(f.steps.some(step=>step.stepKey==="draft_save"));await runAiRewriteTask(1);assert.equal(f.saved.length,1);}
 if(["text","email","file"].includes(type)){assert.ok(f.task.scrapedHtml.length>20000);assert.ok(f.saved[0].htmlContent.includes("SOURCE END"));}
}
f.task={id:2,sourceType:"url",sourceUrl:"https://example.com/removed",scrapedTitle:"Saved source",scrapedHtml:"<p>Saved full snapshot END</p>",sourceMaterialId:null,status:"pending",attempts:1,leaseOwner:null,createdAt:new Date()};f.saved=[];const before=f.fetches;
await runAiRewriteTask(2);assert.equal(f.fetches,before);assert.equal(f.task.status,"succeeded");assert.ok(f.saved[0].htmlContent.includes("Saved full snapshot END"));
assert.equal(f.translations,0);
const {createEnglishTranslationSource}=await import("./src/server/ai/english-translation-source.ts");
const source={id:20,title:"中文标题",content:"完整中文正文",description:"中文描述",keywords:null,categoryId:3};
f.allowTranslation=true;f.task={id:3,sourceType:"english",sourceUrl:"post://20/english",sourceTitle:source.title,sourceContent:source.content,diagnostics:JSON.stringify(createEnglishTranslationSource(source)),status:"pending",attempts:0,leaseOwner:null,createdAt:new Date()};
await runAiRewriteTask(3);assert.equal(f.translations,1);assert.equal(f.task.status,"succeeded");assert.equal(f.task.postId,43);
`);
});

void test("draft, task and material commit together; lost leases and failures cannot create duplicates or overwrite edits", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {TaskLeaseLostError} from "@fwqgo/core/task-lease";
const now=new Date("2026-09-13T00:00:00.000Z"),name=t=>t[Symbol.for("drizzle:Name")];
const f={task:{id:1,status:"running",leaseOwner:"owner",sourceType:"url",sourceMaterialId:2,postId:null,categoryId:3,attempts:1,createdAt:now,updatedAt:now},material:{status:"running"},posts:[],steps:[],commits:0,failStep:false,locks:0};
const tx={
 select(){let table;const q={from(t){table=name(t);return q;},where(){return q;},for(){f.locks++;return q;},limit:async()=>table==="ai_rewrite_tasks"?[structuredClone(f.task)]:f.posts};return q;},
 update(table){return {set(values){return {where:async()=>{if(name(table)==="ai_rewrite_tasks")f.task={...f.task,...values};else if(name(table)==="source_materials")f.material={...f.material,...values};else throw new Error("Existing posts must never be updated");}};}};},
 insert(table){assert.equal(name(table),"ai_task_steps");return {values(values){return {onConflictDoUpdate:async()=>{if(f.failStep)throw new Error("Fixture step write failed");f.steps.push(values);}};}};},
};
const db={async transaction(work){const before=structuredClone({task:f.task,material:f.material,posts:f.posts,steps:f.steps});try{const result=await work(tx);f.commits++;return result;}catch(error){Object.assign(f,before);throw error;}}};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@/server/posts/create-post-record",()=>({createPostRecordInTransaction:async(input,transaction)=>{assert.equal(transaction,tx);const post={...input,id:42};f.posts.push(post);return {data:post};}}));
mock.module("@/server/images/assets",()=>({syncImageReferencesForPost:async()=>{throw new Error("Postcommit image reference failure");}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){throw new Error("Postcommit cache failure");}}));
mock.module("@/server/images/cover-generation-task-runner",()=>({enqueueArticleCoverGenerationTask:()=>{throw new Error("No automatic cover work");}}));
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfig:()=>{throw new Error("No text model lookup");}}));
const {saveCollectedArticleDraft}=await import("./src/server/posts/collected-article-draft.ts");
const task=structuredClone(f.task),content="Complete cleaned draft. ".repeat(1400)+"[Buy](https://merchant.example/buy?pid=1&affid=33)\nSOURCE END";
const article={title:"Source title",description:"",htmlContent:content};
await assert.rejects(saveCollectedArticleDraft({...task,leaseOwner:"stale-owner"},article),TaskLeaseLostError);assert.equal(f.posts.length,0);
f.failStep=true;await assert.rejects(saveCollectedArticleDraft(task,article),/Fixture step write failed/);
assert.equal(f.posts.length,0);assert.equal(f.task.status,"running");assert.equal(f.material.status,"running");
f.failStep=false;const post=await saveCollectedArticleDraft(task,article);
assert.equal(post.content,content);assert.equal(post.published,false);assert.equal(post.imgUrl,"/img/placeholders/fwq-placeholder.png");assert.equal(post.description,"");assert.equal(post.keywords,"");
assert.equal(f.task.postId,42);assert.equal(f.task.status,"succeeded");assert.equal(f.task.leaseOwner,null);assert.equal(f.material.status,"succeeded");assert.equal(f.steps[0].stepKey,"draft_save");assert.equal(f.commits,1);assert.ok(f.locks>0);
f.posts[0].content="Human edit that must survive retries";f.posts[0].published=true;
f.task={...f.task,status:"running",leaseOwner:"retry-owner",attempts:2};
await saveCollectedArticleDraft(structuredClone(f.task),article);
assert.equal(f.posts.length,1);assert.equal(f.posts[0].content,"Human edit that must survive retries");assert.equal(f.posts[0].published,true);
`);
});

void test("draft editing permits unfinished SEO while publishing still requires it", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {postEditSchema} from "./src/features/cms/lib/post-edit.ts";
const draft={id:1,title:"Source title",slug:"source-1",content:"Full source body",published:false,description:"",keywords:"",categoryId:1,recommendTagName:"",newTags:[]};
assert.equal(postEditSchema.safeParse(draft).success,true);
assert.equal(postEditSchema.safeParse({...draft,published:true}).success,false);
assert.equal(postEditSchema.safeParse({...draft,published:true,description:"Human SEO",newTags:[{tag:{name:"VPS",slug:"vps"}}]}).success,true);
assert.equal(postEditSchema.safeParse({...draft,slug:"bad/slug"}).success,false);
`);
});

void test("manual submission requires an admin and valid metadata before any write", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
let authorized=false,writes=0;
class Unauthorized extends Error {}
mock.module("@fwqgo/auth/session",()=>({requireAdminSession:async()=>{if(!authorized)throw new Unauthorized();return {userId:"fixture"};},isUnauthorizedError:error=>error instanceof Unauthorized}));
mock.module("@/server/posts/manual-article-task",()=>({saveManualArticleTask:async()=>{writes++;return {postId:1,slug:"manual",warnings:[]};}}));
mock.module("next/cache",()=>({revalidatePath(){}}));
const {saveManualArticleTaskAction}=await import("./src/features/cms/actions/manual-article.ts");
assert.match((await saveManualArticleTaskAction({})).error,/登录/);assert.equal(writes,0);
authorized=true;
const input={taskId:1,expectedUpdatedAt:"2026-09-12T00:00:00.000Z",title:"Manual title",slug:"manual",description:"Manual description",content:"Manual article body",keywords:"manual",tagNames:["Manual"]};
assert.ok((await saveManualArticleTaskAction({...input,slug:"bad/slug"})).error);
assert.ok((await saveManualArticleTaskAction({...input,description:""})).error);
assert.equal(writes,0);
assert.equal((await saveManualArticleTaskAction(input)).data.postId,1);assert.equal(writes,1);
`);
});

void test("manual English input creates a separate draft and preserves the Chinese source and existing translations", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
const dialect=new PgDialect(),now=new Date("2026-09-12T00:00:00.000Z");
const parent={id:20,title:"中文来源",content:"中文原文保持不变",language:"zh"};
const original=structuredClone(parent);
const f={task:{id:1,status:"manual_required",sourceType:"english",sourceUrl:"post://20/english",sourceMaterialId:null,postId:20,categoryId:3,attempts:1,createdAt:now,updatedAt:now},translation:null,created:[],parentLocks:0};
const name=t=>t[Symbol.for("drizzle:Name")];
const tx={
 select(){let table,condition;const q={from(t){table=name(t);return q;},where(c){condition=c;return q;},for(){if(table==="posts")f.parentLocks++;return q;},limit:async()=>{if(table==="ai_rewrite_tasks")return [structuredClone(f.task)];if(dialect.sqlToQuery(condition).sql.includes('"translationSourcePostId"'))return f.translation?[f.translation]:[];return [parent];}};return q;},
 update(table){assert.equal(name(table),"ai_rewrite_tasks");return {set(values){return {where:async()=>{f.task={...f.task,...values};}};}};},
 insert(){return {values(){return {onConflictDoUpdate:async()=>{}};}};},
};
mock.module("@fwqgo/db",()=>({db:{transaction:async work=>work(tx)}}));
mock.module("@/server/posts/create-post-record",()=>({createPostRecordInTransaction:async(input,transaction)=>{assert.equal(transaction,tx);const post={...input.post,id:42};f.created.push(post);return {data:post};}}));
mock.module("@/server/images/assets",()=>({syncImageReferencesForPost:async()=>{}}));
mock.module("@/server/posts/internal-links",()=>({regeneratePostInternalLinks:async()=>{}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){}}));
mock.module("@/server/images/cover-generation-task-runner",()=>({enqueueArticleCoverGenerationTask:async()=>{throw new Error("English saves must not generate a cover");}}));
const {saveManualArticleTask}=await import("./src/server/posts/manual-article-task.ts");
const input={taskId:1,expectedUpdatedAt:now.toISOString(),title:"Human English title",slug:"human-english",description:"Human English description",keywords:"manual",content:"The English body was supplied by the editor.",tagNames:["Manual"]};
await saveManualArticleTask(input);
assert.equal(f.created.length,1);assert.equal(f.created[0].language,"en");assert.equal(f.created[0].translationSourcePostId,20);assert.equal(f.created[0].content,input.content);
assert.deepEqual(parent,original);assert.ok(f.parentLocks>0);assert.equal(f.task.postId,42);
f.task={...f.task,status:"manual_required",postId:20,updatedAt:now};f.translation={id:42,content:input.content};
await assert.rejects(saveManualArticleTask(input),/已存在英文文章/);
assert.equal(f.created.length,1);assert.deepEqual(parent,original);
`);
});

void test("manual English drafts reuse bilingual tags, preserve their English names and default the cover", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
const dialect=new PgDialect();
const bilingual={id:7,name:"虚拟化",slug:"虚拟化",enName:"Virtualization",enSlug:"virtualization"};
const f={tags:[bilingual],posts:[],links:[]};
const name=table=>table[Symbol.for("drizzle:Name")];
const tx={
 select(){let table,condition;const q={from(t){table=name(t);return q;},where(c){condition=c;return q;},limit:async()=>{if(table==="categories")return [{id:1,slug:"vps"}];if(table!=="tags")return [];const query=dialect.sqlToQuery(condition);assert.ok(query.sql.includes('"enName"')&&query.sql.includes('"enSlug"'));return f.tags.filter(tag=>[tag.name,tag.slug,tag.enName,tag.enSlug].some(value=>query.params.includes(value)));}};return q;},
 insert(table){let values;const apply=()=>{if(name(table)==="posts"){const row={...values,id:42};f.posts.push(row);return [row];}if(name(table)==="tags"){const row={...values,id:8};f.tags.push(row);return [row];}f.links.push(...values);return [];};const q={values(v){values=v;return q;},onConflictDoNothing(){return q;},returning:async()=>apply(),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};return q;},
};
mock.module("@fwqgo/db",()=>({db:{select(){throw new Error("Use the existing transaction");}}}));
mock.module("@/server/links/outbound-short-link",()=>({shortenArticleOutboundLinks:async content=>content,shortenMarkdownOutboundLinks:async content=>content}));
mock.module("@/server/images/assets",()=>({syncImageReferencesForPost:async()=>{}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){}}));
const {createPostRecordInTransaction}=await import("./src/server/posts/create-post-record.ts");
const input={post:{title:"Manually entered title",slug:"manual-english",description:"Manually entered SEO",content:"Editor supplied English content.",language:"en",translationSourcePostId:20,categoryId:1,published:false,recommendedTagName:"Virtualization"},tags:[{name:"Virtualization"},{name:"Bandwidth"}]};
const result=await createPostRecordInTransaction(input,tx);
assert.equal(result.error,undefined);assert.equal(result.data.content,input.post.content);assert.equal(result.data.slug,input.post.slug);
assert.equal(result.data.recommendedTagId,7);assert.equal(result.data.recommendedTagName,"Virtualization");
assert.equal(result.data.imgUrl,"/img/placeholders/fwq-placeholder.png");
assert.deepEqual(f.links,[{postId:42,tagId:7},{postId:42,tagId:8}]);
assert.equal(f.tags.length,2);assert.equal(f.tags[1].enName,"Bandwidth");assert.equal(f.tags[1].enSlug,"bandwidth");
assert.deepEqual(f.tags[0],bilingual);
const invalid=await createPostRecordInTransaction({...input,tags:[{name:"中文标签"}]},tx);
assert.match(invalid.error,/英文标签/);assert.equal(f.posts.length,1);
`);
});

void test("the explicit cover action authenticates, queues on request, reuses active work and reports whether the cover was applied", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
const batchId="c9259b4a-dae6-4bb9-a9f9-cfda63e979af";
const f={authorized:false,reads:0,queued:0,task:null,cover:"/img/placeholders/fwq-placeholder.png"};
const name=table=>table[Symbol.for("drizzle:Name")];
const db={select(){f.reads++;let table;const rows=()=>table==="posts"?[{id:1,title:"Manual article",imgUrl:f.cover}]:(f.task?[f.task]:[]);const q={from(t){table=name(t);return q;},where(){return q;},orderBy(){return q;},limit:async()=>rows(),then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;}};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@fwqgo/auth/session",()=>({requireAdminSession:async()=>{if(!f.authorized)throw new Error("Unauthorized");return {userId:"admin"};}}));
mock.module("next/cache",()=>({revalidatePath(){},revalidateTag(){},updateTag(){},cacheTag(){}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){}}));
mock.module("@/server/images/generation-config",()=>({getActiveImageGenerationConfig:async()=>null}));
mock.module("@/server/images/cover-generation-task-runner",()=>({
 enqueueArticleCoverGenerationTask:async input=>{assert.equal(input.postId,1);assert.equal(input.createdBy,"admin");assert.equal(input.description,"Current unsaved article description");f.queued++;f.task={id:9,batchId,postId:1,status:"pending",outputUrl:null};return {task:f.task};},
 enqueueStandaloneCoverGenerationTask:async()=>{throw new Error("An existing article must remain linked to its cover task");},
 ensureCoverGenerationWorker:async()=>{},
 formatCoverGenerationError:error=>({title:"Cover error",detail:error.message}),
 serializeCoverTask:task=>({taskId:task.id,postId:task.postId,status:task.status,success:task.status==="succeeded",url:task.outputUrl}),
 terminalCoverTaskStatuses:["succeeded","failed","uncertain","cancelled"],
}));
const {generateArticleCoverImageAction,getCoverGenerationBatchStatusAction}=await import("./src/features/cms/actions/article-cover-image.ts");
assert.equal(f.queued,0);assert.equal(f.reads,0);
const input={postId:1,title:"Manual article",description:"Current unsaved article description"};
assert.equal((await generateArticleCoverImageAction(input)).success,false);assert.equal(f.reads,0);assert.equal(f.queued,0);
f.authorized=true;
assert.equal((await generateArticleCoverImageAction({...input,title:""})).success,false);assert.equal(f.queued,0);
const queued=await generateArticleCoverImageAction(input);
assert.equal(queued.success,true);assert.equal(queued.queued,true);assert.equal(f.queued,1);
assert.equal((await generateArticleCoverImageAction(input)).reused,true);assert.equal(f.queued,1);
f.task={...f.task,status:"succeeded",outputUrl:"/uploads/generated-cover.webp"};
f.cover=f.task.outputUrl;
assert.equal((await getCoverGenerationBatchStatusAction(batchId)).results[0].appliedToPost,true);
f.cover="/uploads/manual-cover.webp";
assert.equal((await getCoverGenerationBatchStatusAction(batchId)).results[0].appliedToPost,false);
`);
});

void test("a manually requested cover replaces the placeholder but preserves an image chosen while it runs", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
const dialect=new PgDialect();
const f={cover:null,refreshes:0,allowConfig:false};
const name=table=>table[Symbol.for("drizzle:Name")];
const db={
 async transaction(work){return work(db);},
 select(){let table;const rows=()=>table==="posts"?[{id:1,title:"Fixture",slug:"fixture",description:"Article description for the cover",content:"Manual article body",categoryId:3,language:"zh",imgUrl:f.cover}]:[];const q={from(t){table=name(t);return q;},where:()=>q,limit:async()=>rows(),then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;},
 insert(){let values;const q={values(v){values=v;return q;},returning:async()=>[{...values,id:9}]};return q;},
 update(table){let values,condition;const q={set(value){values=value;return q;},where(value){condition=value;return q;},returning:async()=>{if(name(table)!=="posts")return [{id:9}];const query=dialect.sqlToQuery(condition);const guarded=query.sql.includes('"imgUrl" =');const matches=f.cover===null?query.sql.includes('"imgUrl" is null'):query.params.includes(f.cover);if(guarded&&!matches)return [];f.cover=values.imgUrl;return [{id:1,slug:"fixture",categoryId:3}];}};return q;},
};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@fwqgo/cache/tags",()=>({cacheTags:{posts:"posts",homepage:"home",homepageSlots:"slots",post:id=>"post:"+id,postSlug:slug=>slug,category:id=>"cat:"+id},revalidateSiteContent(){f.refreshes++;}}));
mock.module("@/server/images/assets",()=>({syncImageReferencesForPost:async()=>{f.refreshes++;}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){f.refreshes++;}}));
mock.module("@/server/admin/background-jobs",()=>({enqueueAdminBackgroundJob:async()=>{}}));
mock.module("@/server/images/generated-cover",()=>({generateArticleCoverImage:()=>{throw new Error("Unexpected repeated image generation");}}));
mock.module("@/server/images/generated-custom-image",()=>({generateCustomImage:()=>{throw new Error("Unexpected image generation");}}));
mock.module("@/server/images/generation-config",()=>({getActiveImageGenerationConfig:()=>{assert.equal(f.allowConfig,true,"An asset checkpoint must not need model configuration");return {id:2,name:"Fixture",model:"fixture",provider:"fixture"};},getEnabledImageGenerationConfigs:async()=>{throw new Error("An asset checkpoint must not call the model");}}));
const workerSource=fs.readFileSync("./src/server/images/cover-generation-task-runner.ts","utf8")+"\nexport {processCoverGenerationTask};";
const transpiler=new Bun.Transpiler({loader:"ts"});
let compiled=transpiler.transformSync(workerSource);
for(const dependency of transpiler.scanImports(workerSource)) {
 if(!dependency.path.startsWith("node:")) compiled=compiled.replaceAll(JSON.stringify(dependency.path),JSON.stringify(Bun.resolveSync(dependency.path,process.cwd())));
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fwqgo-cover-fixture-"));
const fixturePath=path.join(directory,"cover-worker.mjs");
fs.writeFileSync(fixturePath,compiled);
try {
const {processCoverGenerationTask,enqueueArticleCoverGenerationTask}=await import(pathToFileURL(fixturePath).href);
const placeholder="/img/placeholders/fwq-placeholder.png";
for(const [initial,current,shouldReplace] of [[placeholder,placeholder,true],[null,null,true],["","",true],[placeholder,"/uploads/manual-cover.webp",false],[placeholder,"/uploads/generated-zh-cover.webp",true],["/uploads/old-cover.webp","/uploads/old-cover.webp",true],["/uploads/old-cover.webp","/uploads/new-manual-cover.webp",false],[null,"/uploads/new-manual-cover.webp",false],["/uploads/old-cover.webp",null,false]]) {
 f.cover=initial;f.refreshes=0;f.allowConfig=true;
 const queued=await enqueueArticleCoverGenerationTask({postId:1,title:"Fixture",createdBy:"admin"});
 assert.equal(queued.task.inputSnapshot.replaceDefaultCoverOnly,!initial||initial===placeholder);
 f.cover=current;f.allowConfig=false;
 const task={...queued.task,assetId:7,outputUrl:"/uploads/generated-zh-cover.webp",prompt:"saved prompt",leaseOwner:"fixture"};
 const result=await processCoverGenerationTask(task,new AbortController().signal);
 assert.equal(result.asset.path,"/uploads/generated-zh-cover.webp");
 if(!shouldReplace){assert.equal(f.cover,current);assert.equal(f.refreshes,0);}
 else {assert.equal(f.cover,result.asset.path);assert.equal(f.refreshes,3);}
}
} finally {fs.rmSync(directory,{recursive:true,force:true});}
`);
});
