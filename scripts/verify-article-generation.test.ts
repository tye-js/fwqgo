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
    `${result.stdout}\n${result.stderr}`.slice(0, 16000),
  );
}

void test("the English button action authenticates, snapshots the full Chinese article and preserves existing English drafts", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {readEnglishTranslationSource} from "./src/server/ai/english-translation-source.ts";
const dialect=new PgDialect();
const source={id:20,title:"中文优惠",slug:"source",language:"zh",content:"完整中文正文。".repeat(4000)+"SOURCE END",description:"中文摘要",keywords:"VPS,香港",categoryId:3,translationSourcePostId:null};
const config={id:7,name:"English configuration",model:"translation-model",provider:"compatible",maxTokens:8192,apiKey:"private-fixture-key"};
const f={authorized:false,reads:0,configReads:0,config,post:structuredClone(source),english:null,queued:[],submitted:[]};
const db={select(){f.reads++;let condition;const rows=()=>dialect.sqlToQuery(condition).sql.includes('"translationSourcePostId"')?(f.english?[f.english]:[]):[f.post];const q={from(){return q;},where(c){condition=c;return q;},limit:async()=>rows(),then(resolve,reject){return Promise.resolve(rows()).then(resolve,reject);}};return q;}};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@fwqgo/auth/session",()=>({requireAdminSession:async()=>{if(!f.authorized)throw new Error("Unauthorized");return {userId:"admin"};}}));
mock.module("next/cache",()=>({revalidatePath(){}}));
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfig:async()=>{f.configReads++;return f.config;}}));
mock.module("@/server/ai/derived-task",()=>({upsertDerivedAiTask:async(input)=>{f.submitted.push(input);return {id:41,status:"pending"};}}));
mock.module("@/server/ai/rewrite-task-runner",()=>({enqueueAiRewriteTask:async(id)=>{f.queued.push(id);}}));
const {enqueueEnglishVersionForPostAction,bulkEnqueueEnglishVersionsForPostsAction}=await import("./src/features/cms/actions/ai-rewrite-task.ts");
assert.ok((await enqueueEnglishVersionForPostAction(20)).error);assert.equal(f.reads,0);assert.equal(f.configReads,0);
f.authorized=true;assert.ok((await enqueueEnglishVersionForPostAction(NaN)).error);assert.equal(f.reads,0);
f.english={id:21,slug:"existing-english"};f.post.content="";f.config=null;
const existing=await enqueueEnglishVersionForPostAction(20);assert.equal(existing.data.postId,21);assert.equal(existing.data.postSlug,"existing-english");assert.equal(f.configReads,0);assert.equal(f.submitted.length,0);
f.post=structuredClone(source);f.english=null;
assert.ok((await enqueueEnglishVersionForPostAction(20)).error);assert.equal(f.submitted.length,0);
f.config=config;
const result=await enqueueEnglishVersionForPostAction(20);assert.equal(result.data.taskId,41);assert.deepEqual(f.queued,[41]);assert.equal(f.submitted.length,1);
const input=f.submitted[0];assert.equal(input.sourceContent,source.content);assert.ok(input.sourceContent.endsWith("SOURCE END"));assert.equal(input.sourceType,"english");assert.equal(input.initialPostId,null);assert.equal(input.rewriteConfig.model,config.model);assert.equal(readEnglishTranslationSource(input.diagnostics).sourcePostId,20);assert.ok(!JSON.stringify(input).includes(config.apiKey));
f.english={id:21,slug:"existing-english"};const count=f.configReads;
const bulk=await bulkEnqueueEnglishVersionsForPostsAction([20]);assert.equal(bulk.data.queued,0);assert.equal(bulk.data.skipped,1);assert.equal(f.configReads,count);assert.equal(f.submitted.length,1);
`);
});

const translationFixture = String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {createEnglishTranslationSource} from "./src/server/ai/english-translation-source.ts";
const dialect=new PgDialect(),name=t=>t[Symbol.for("drizzle:Name")];
const original={id:20,title:"中文优惠文章",content:"## 中文套餐\n\n"+"完整中文原文，不可改写。".repeat(600)+"\n\n| 方案 | 购买 |\n| --- | --- |\n| A | [购买 A](https://merchant.example/buy?pid=1&affid=33) |\n| B | [购买 B](https://merchant.example/buy?pid=2&affid=33) |",description:"中文描述",keywords:"VPS,香港",categoryId:3,language:"zh"};
const translated="## English plans\n\n"+"Faithful English translation of the complete source article. ".repeat(600)+"\n\n| Plan | Buy |\n| --- | --- |\n| A | [Buy A](https://merchant.example/buy?pid=1&affid=33) |\n| B | [Buy B](https://merchant.example/buy?pid=2&affid=33) |";
const metadata={enTitle:"English VPS offer",enSlug:"english-vps-offer",enDescription:"A faithful English offer description",enKeywords:["VPS","Hong Kong"],enTags:[{name:"VPS",slug:"vps"},{name:"Hong Kong",slug:"hong-kong"}],enRecommendTagName:"VPS",enCategoryName:"VPS",enCategorySlug:"vps"};
const snapshot=createEnglishTranslationSource(original);
const f={parent:structuredClone(original),task:{id:41,sourceType:"english",sourceUrl:"post://20/english",sourceTitle:original.title,sourceContent:original.content,diagnostics:JSON.stringify(snapshot),categoryId:3,rewriteStyleId:7,status:"running",leaseOwner:"owner",attempts:1},english:[],steps:[],artifacts:[],bodyCalls:0,metadataCalls:0,configReads:0,failSave:false,failMetadata:false,changeSource:false,loseLease:false,noConfig:false};
const config={id:7,name:"Translation fixture",provider:"compatible",model:"fixture",maxTokens:8192,temperature:0,apiKey:"fixture-key-not-for-snapshots"};
const db={
 async transaction(work){const before=structuredClone({parent:f.parent,task:f.task,english:f.english,steps:f.steps,artifacts:f.artifacts});try{return await work(db);}catch(error){Object.assign(f,before);throw error;}},
 select(){let table,condition;const rows=()=>{
  if(table==="posts")return dialect.sqlToQuery(condition).sql.includes('"translationSourcePostId"')?f.english:[f.parent];
  if(table==="ai_rewrite_tasks")return [structuredClone(f.task)];
  if(table==="categories")return [{id:3,name:"服务器",slug:"servers",enName:"Servers",enSlug:"servers"}];
  if(table==="ai_task_steps"){const q=dialect.sqlToQuery(condition);return f.steps.filter(v=>v.status==="success"&&q.params.includes(v.stepKey)).sort((a,b)=>b.attempt-a.attempt).slice(0,1);}
  throw new Error("Unexpected read: "+table);
 };const q={from(t){table=name(t);return q;},where(c){condition=c;return q;},orderBy(){return q;},for(){return q;},limit:async()=>structuredClone(rows()),then(resolve,reject){return Promise.resolve().then(rows).then(resolve,reject);}};return q;},
 update(t){let values,condition;const apply=()=>{assert.equal(name(t),"ai_rewrite_tasks");const q=dialect.sqlToQuery(condition);if(q.sql.includes('"leaseOwner" =')&&!q.params.includes(f.task.leaseOwner))return [];if(q.sql.includes('"status" =')&&!q.params.includes(f.task.status))return [];f.task={...f.task,...values};return [structuredClone(f.task)];};const q={set(v){values=v;return q;},where(c){condition=c;return q;},returning:async()=>apply(),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};return q;},
 insert(t){let values;const apply=()=>{const table=name(t);if(table==="ai_task_steps"){if(f.failSave&&values.stepKey==="english_save")throw new Error("Fixture save failed");const found=f.steps.find(v=>v.stepKey===values.stepKey&&v.attempt===values.attempt);if(found)Object.assign(found,values);else f.steps.push(values);return;}if(table==="ai_rewrite_artifacts"){f.artifacts.push(values);return;}throw new Error("Unexpected insert: "+table);};const q={values(v){values=v;return q;},onConflictDoUpdate:async()=>apply()};return q;},
};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfigWithFallback:async()=>{f.configReads++;if(f.noConfig)throw new Error("A completed checkpoint must not require model configuration");return config;}}));
const audit=(stage,text)=>({stage,stageName:stage,stageAttempt:1,status:"success",prompt:"fixture-prompt",response:text,readableContent:text,maxTokens:8192,temperature:0,finishReason:"stop",config:{id:7,name:config.name,provider:config.provider,model:config.model,maxTokens:8192,temperature:0,updatedAt:null}});
mock.module("@fwqgo/ai/article-rewriter",()=>({
 generateEnglishArticleContent:async(input,options)=>{f.bodyCalls++;assert.ok(input.markdownContent.includes("完整中文原文"));assert.ok(input.markdownContent.includes("pid=2&affid=33"));await options.onRequestStage("request_started");if(f.loseLease)f.task.leaseOwner="new-owner";await options.onAudit(audit("english_content_generation",translated));await options.onRequestStage("checkpointed");return translated;},
 generateEnglishMetadata:async(input,options)=>{f.metadataCalls++;assert.equal(input.enContent,translated);if(f.failMetadata)throw new Error("Fixture metadata failed");if(f.changeSource)f.parent.content+="\n用户刚保存的新正文";await options.onAudit(audit("english_metadata_generation",JSON.stringify(metadata)));return metadata;},
}));
mock.module("@/server/posts/create-post-record",()=>({createPostRecordInTransaction:async(input,tx)=>{assert.equal(tx,db);const post={...input.post,id:42};f.english.push(post);return {data:post};}}));
mock.module("@/server/images/assets",()=>({syncImageReferencesForPost:async()=>{}}));
mock.module("@/server/posts/internal-links",()=>({regeneratePostInternalLinks:async input=>{assert.equal(input.includeKnowledge,false);}}));
mock.module("@/server/cache/public-revalidation-client",()=>({schedulePublicWebCache(){}}));
const {runEnglishTranslationTask,assertTranslatedArticleStructure}=await import("./src/server/ai/english-translation-task.ts");
const run=()=>runEnglishTranslationTask(structuredClone(f.task),snapshot,new AbortController().signal);
`;

void test("English translation saves an independent draft and keeps the source and every purchase link", () => {
  isolated(
    translationFixture +
      String.raw`
await run();
assert.equal(f.bodyCalls,1);assert.equal(f.metadataCalls,1);assert.equal(f.english.length,1);
const post=f.english[0];assert.equal(post.language,"en");assert.equal(post.translationSourcePostId,20);assert.equal(post.content,translated);assert.equal(post.published,false);assert.equal(post.imgUrl,"/img/placeholders/fwq-placeholder.png");
assert.deepEqual(f.parent,original);assert.equal(f.task.status,"succeeded");assert.equal(f.task.postId,42);assert.equal(f.task.leaseOwner,null);
assert.ok(f.steps.some(v=>v.stepKey==="english_save"&&v.status==="success"));
assert.ok(f.artifacts.length>=2);assert.ok(!JSON.stringify(f.artifacts).includes(config.apiKey));
assert.throws(()=>assertTranslatedArticleStructure(original.content,translated.replace("pid=2&affid=33","pid=2&affid=attacker")),/链接/);
assert.throws(()=>assertTranslatedArticleStructure("| A | B |\n| --- | --- |\n| 1 | 2 |","English prose only"),/表格/);
`,
  );
});

void test("a failed final save rolls back and resumes completed translations without another model request", () => {
  isolated(
    translationFixture +
      String.raw`
f.failSave=true;await assert.rejects(run(),/Fixture save failed/);
assert.equal(f.english.length,0);assert.equal(f.task.status,"running");assert.equal(f.bodyCalls,1);assert.equal(f.metadataCalls,1);
f.failSave=false;f.noConfig=true;f.task.attempts=2;
await run();assert.equal(f.english.length,1);assert.equal(f.bodyCalls,1);assert.equal(f.metadataCalls,1);assert.equal(f.configReads,1);
`,
  );
});

void test("metadata retries reuse the complete English body", () => {
  isolated(
    translationFixture +
      String.raw`
f.failMetadata=true;await assert.rejects(run(),/Fixture metadata failed/);assert.equal(f.english.length,0);
f.failMetadata=false;f.task.attempts=2;await run();
assert.equal(f.bodyCalls,1);assert.equal(f.metadataCalls,2);assert.equal(f.english[0].content,translated);
`,
  );
});

void test("source edits and lost leases prevent stale translation writes", () => {
  isolated(
    translationFixture +
      String.raw`
f.changeSource=true;await assert.rejects(run(),/中文文章已更新/);assert.equal(f.english.length,0);assert.ok(f.parent.content.endsWith("用户刚保存的新正文"));
`,
  );
  isolated(
    translationFixture +
      String.raw`
f.loseLease=true;await assert.rejects(run());assert.equal(f.english.length,0);assert.equal(f.task.leaseOwner,"new-owner");
`,
  );
});

void test("existing English articles are reused without model calls or overwritten content", () => {
  isolated(
    translationFixture +
      String.raw`
f.english.push({id:72,title:"Existing English",slug:"existing-en",content:"Operator edited translation",categoryId:3,published:true,language:"en",translationSourcePostId:20});f.noConfig=true;
await run();assert.equal(f.task.postId,72);assert.equal(f.english.length,1);assert.equal(f.english[0].content,"Operator edited translation");assert.equal(f.english[0].published,true);assert.equal(f.bodyCalls,0);assert.equal(f.metadataCalls,0);assert.equal(f.configReads,0);
`,
  );
});

void test("the English model receives the full source and cannot accept unfinished continuations", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import * as networkModule from "./packages/core/network-url.ts";
const network={...networkModule};
const config={id:1,name:"Fixture",provider:"compatible",baseUrl:"https://api.example/v1",apiKey:"fixture",model:"fixture",temperature:0,maxTokens:256,updatedAt:null,englishContentPrompt:"Translate all of this:\n{markdownContent}",englishContinuationPrompt:"Continue the full translation. {originalPrompt}\n{generatedContentTail}"};
let mode="complete",calls=0;
const source="原始中文正文。".repeat(7000)+"SOURCE TAIL MUST BE TRANSLATED";
mock.module("@fwqgo/ai/rewrite-config",()=>({getActiveAiRewriteConfig:async()=>config}));
mock.module("@fwqgo/core/network-url",()=>({...network,fetchPublicHttpUrlOnce:async(url,options)=>{calls++;const request=JSON.parse(options.body);assert.equal(request.max_tokens,256);assert.ok(request.messages[0].content.includes("SOURCE TAIL MUST BE TRANSLATED"));return new Response(JSON.stringify({choices:[{message:{content:mode==="empty-continuation"&&calls>1?" ":("English paragraph "+calls+". ").repeat(40)},finish_reason:mode==="complete"?"stop":"length"}],usage:{completion_tokens:128}}));}}));
const {generateEnglishArticleContent}=await import("./packages/ai/article-rewriter.ts");
const input={title:"中文标题",description:"中文描述",keywords:null,markdownContent:source};
assert.ok((await generateEnglishArticleContent(input)).length>120);assert.equal(calls,1);
mode="truncated";calls=0;await assert.rejects(generateEnglishArticleContent(input),/尚未完成/);assert.equal(calls,4);
mode="empty-continuation";calls=0;await assert.rejects(generateEnglishArticleContent(input),/尚未完成/);assert.equal(calls,2);
const controller=new AbortController();controller.abort(new Error("cancelled by fixture"));calls=0;
await assert.rejects(generateEnglishArticleContent(input,{signal:controller.signal}),/cancelled by fixture/);assert.equal(calls,0);
`);
});

void test("cover tasks snapshot the current description and configured model for both languages", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
const name=t=>t[Symbol.for("drizzle:Name")];
const f={post:{id:1,title:"Saved title",description:"Old saved description",content:"ARTICLE BODY MUST NOT BE SENT",keywords:"IGNORED KEYWORDS",slug:"article",language:"zh",imgUrl:"/uploads/original.webp"},queued:[],configReads:0};
const db={transaction:async work=>work(db),select(){const q={from(t){assert.equal(name(t),"posts");return q;},where(){return q;},limit:async()=>[f.post]};return q;},insert(t){assert.equal(name(t),"image_cover_generation_tasks");return {values(value){return {returning:async()=>{const task={...value,id:9};f.queued.push(task);return [task];}};}};}};
mock.module("@fwqgo/db",()=>({db}));
mock.module("@/server/admin/background-jobs",()=>({enqueueAdminBackgroundJob:async()=>{}}));
mock.module("@/server/images/generation-config",()=>({getActiveImageGenerationConfig:async()=>{f.configReads++;return {id:44,name:"Selected configuration",provider:"compatible",model:"configured-image-model"};},getEnabledImageGenerationConfigs:async()=>[]}));
const {enqueueArticleCoverGenerationTask}=await import("./src/server/images/cover-generation-task-runner.ts");
for(const language of ["zh","en"]){f.post.language=language;await enqueueArticleCoverGenerationTask({postId:1,title:"Current article title",description:"Current edited description",configId:44,createdBy:"admin"});const task=f.queued.at(-1);assert.equal(task.configId,44);assert.equal(task.model,"configured-image-model");assert.equal(task.inputSnapshot.description,"Current edited description");assert.equal(task.inputSnapshot.language,language);assert.equal(task.inputSnapshot.expectedCoverUrl,"/uploads/original.webp");assert.equal(task.inputSnapshot.content,undefined);assert.equal(task.inputSnapshot.keywords,undefined);}
const before=f.configReads;await assert.rejects(enqueueArticleCoverGenerationTask({postId:1,title:"Title",description:""}),/文章描述/);assert.equal(f.configReads,before);
`);
});

void test("cover requests use the language template and image parameters without article-body overrides", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import * as networkModule from "./packages/core/network-url.ts";
const network={...networkModule},requests=[],assets=[];
const config={id:44,name:"Configured image model",provider:"openai",model:"image-model",baseUrl:"https://images.example/v1",apiKey:"fixture",size:"1536x1024",quality:"high",timeoutSeconds:10,promptTemplate:"ZH_STYLE {title}",englishPromptTemplate:"EN_STYLE {description}"};
mock.module("@/server/images/generation-config",()=>({getActiveImageGenerationConfig:async()=>config}));
mock.module("@fwqgo/core/network-url",()=>({...network,assertPublicHttpUrl:async value=>new URL(value),fetchPublicHttpUrlOnce:async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({data:[{b64_json:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}]}));}}));
mock.module("@/server/images/assets",()=>({createImageAssetFromBuffer:async input=>{assets.push(input);return {id:assets.length,path:"/uploads/result.webp"};}}));
const {generateArticleCoverImage}=await import("./src/server/images/generated-cover.ts");
for(const language of ["zh","en"]){await generateArticleCoverImage({title:"Article title",description:"The actual article description",content:"BODY_ONLY_SECRET",keywords:"KEYWORD_ONLY_SECRET",visualBriefOverrides:{title:"OVERRIDE_ONLY_SECRET"},fileSlug:"article",language,uploadedBy:"admin"});const request=requests.at(-1);assert.equal(request.model,"image-model");assert.equal(request.size,"1536x1024");assert.equal(request.quality,"high");assert.ok(request.prompt.includes(language==="en"?"EN_STYLE":"ZH_STYLE"));assert.ok(request.prompt.includes("The actual article description"));assert.ok(!request.prompt.includes("BODY_ONLY_SECRET"));assert.ok(!request.prompt.includes("KEYWORD_ONLY_SECRET"));assert.ok(!request.prompt.includes("OVERRIDE_ONLY_SECRET"));assert.ok(assets.at(-1).originalName.endsWith("-"+language+"-cover.png"));}
await assert.rejects(generateArticleCoverImage({title:"Title",description:"",uploadedBy:"admin"}),/文章描述/);assert.equal(requests.length,2);
`);
});

void test("cover descriptions survive templates with missing or removed legacy placeholders", () => {
  isolated(String.raw`
import assert from "node:assert/strict";
import {buildArticleCoverPrompt} from "./packages/core/image-generation-prompts.ts";
for(const language of ["zh","en"]){
 for(const template of ["Custom style without placeholders", "Legacy line: {description} {content}"]){
  const prompt=buildArticleCoverPrompt(template,template,{language,title:"Article title",description:"Complete current description",content:"BODY MUST NOT APPEAR"});
  assert.ok(prompt.includes("Complete current description"));assert.ok(!prompt.includes("BODY MUST NOT APPEAR"));assert.ok(!prompt.includes("{content}"));
 }
}
`);
});
