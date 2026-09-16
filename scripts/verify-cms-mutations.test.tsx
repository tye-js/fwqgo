import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const interactionFixture = String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {Window} from "happy-dom";
const win=new Window({url:"http://localhost:3100/ai-tasks"});
// Happy DOM omits the section rows collection; keep the real table component.
if(!("rows" in win.HTMLTableSectionElement.prototype))Object.defineProperty(win.HTMLTableSectionElement.prototype,"rows",{get(){return this.querySelectorAll(":scope > tr");}});
for(const key of ["window","document","navigator","HTMLElement","Element","Node","NodeFilter","Event","MouseEvent","PointerEvent","KeyboardEvent","CustomEvent","DocumentFragment","MutationObserver","ResizeObserver","IntersectionObserver","HTMLInputElement","HTMLButtonElement","HTMLFormElement","HTMLSelectElement","HTMLTextAreaElement"]){
 const value=key==="window"?win:win[key];if(value!==undefined)Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
}
for(const key of ["getComputedStyle","requestAnimationFrame","cancelAnimationFrame"]){globalThis[key]=win[key].bind(win);}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client");
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const fx={request:deferred(),refresh:deferred(),calls:[],toasts:[],refreshCount:0,deliveredVersion:0,setVersion:null,nextResult:null,pushed:[]};
const router={refresh(){fx.refreshCount++;fx.setVersion?.(version=>version+1);},push(href){fx.pushed.push(href);}};
mock.module("next/navigation",()=>({useRouter:()=>router,usePathname:()=>"/ai-tasks",useSearchParams:()=>new URLSearchParams()}));
const toast={};for(const kind of ["loading","success","error","warning"]){toast[kind]=(title,options)=>{fx.toasts.push({kind,title,...options});return "mutation-toast";};}
mock.module("sonner",()=>({toast}));
const action=(type,operation)=>async id=>{fx.calls.push({type,operation,id});return fx.request.promise;};
mock.module("@/features/cms/actions/ai-rewrite-task",()=>({retryAiRewriteTaskAction:action("ai","retry"),cancelAiRewriteTaskAction:action("ai","cancel"),deleteAiRewriteTaskAction:action("ai","delete"),resolveManualRequiredAiRewriteTaskAction:action("ai","resolve")}));
mock.module("@/features/cms/actions/article-cover-image",()=>({retryCoverGenerationTaskAction:action("cover","retry"),cancelCoverGenerationTaskAction:action("cover","cancel"),deleteCoverGenerationTaskAction:action("cover","delete")}));
mock.module("@/features/cms/actions/provider-monitors",()=>({retryProviderMonitorRunAction:action("offer","retry")}));
if(!pollingEnabled)mock.module("@/features/cms/components/task-detail-auto-refresh",()=>({TaskDetailAutoRefresh:()=>null}));
const {UnifiedTaskList}=await import("./src/features/cms/components/unified-task-list.tsx");
const {useAdminMutation}=await import("./src/features/cms/hooks/use-admin-mutation.ts");
const makeTask=(id,type="ai",status="failed")=>({uid:type+":"+id,type,id,title:"Task "+id,status,progress:100,description:"旧任务描述",error:"上次执行失败 "+id,href:"/ai-tasks/"+id,sourceLabel:"测试来源",post:null,createdAt:"2026-09-16T00:00:00Z",updatedAt:"2026-09-16T00:01:00Z",startedAt:null,finishedAt:"2026-09-16T00:01:00Z",canRetry:["failed","uncertain","cancelled"].includes(status),canCancel:status==="pending",canResolve:status==="manual_required"});
const makeResult=items=>({items,totalCount:items.length,totalPage:1,filters:{type:"all",status:"all",query:"",pageNo:1,pageSize:20}});
let initialResult=makeResult([makeTask(1),makeTask(2)]);
function Screen({version}){if(version>fx.deliveredVersion)throw fx.refresh.promise;return React.createElement(UnifiedTaskList,{result:version>0?fx.nextResult:initialResult});}
function App(){const [version,setVersion]=React.useState(0);fx.setVersion=setVersion;return React.createElement(React.Suspense,{fallback:React.createElement("p",null,"Loading page")},React.createElement(Screen,{version}));}
const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
const row=(id=1)=>[...document.querySelectorAll("tbody tr")].find(element=>element.textContent.includes("Task "+id));
const button=(scope,label)=>[...scope.querySelectorAll("button")].find(element=>element.textContent.trim()===label);
const status=element=>element.querySelector('[aria-label="任务状态"]').textContent.trim();
async function mount(){await act(async()=>{root.render(React.createElement(App));});}
async function settleAction(result){await act(async()=>{fx.request.resolve(result);});}
async function deliver(result){fx.nextResult=result;fx.deliveredVersion=fx.refreshCount;await act(async()=>{fx.refresh.resolve();});}
const reactWarnings=[],originalError=console.error;
console.error=(...args)=>{const message=args.map(String).join(" ");if(/outside a transition|not wrapped in act|Cannot update a component|Cannot update optimistic state/i.test(message))reactWarnings.push(message);originalError(...args);};
`;

function interact(
  source: string,
  { polling = false }: { polling?: boolean } = {},
) {
  const database = "postgresql://fixture:fixture@127.0.0.1:1/unused";
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: database,
      CMS_DATABASE_URL: database,
      READ_DATABASE_URL: database,
      ANALYTICS_DATABASE_URL: database,
      NEXT_PUBLIC_URL: "http://localhost:3000",
      NEXT_PUBLIC_CMS_URL: "http://localhost:3100",
      ENABLE_CMS_BACKGROUND_WORKERS: "false",
    },
    input:
      `const pollingEnabled=${polling};\n` +
      interactionFixture +
      "\ntry {\n" +
      source +
      String.raw`
} finally {
 await act(async()=>root.unmount());
 await win.happyDOM.cancelAsync();
 win.close();
}
assert.deepEqual(reactWarnings,[],"React mutation updates must stay inside their action lifecycle");
`,
    encoding: "utf8",
    timeout: 25_000,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 18000),
  );
}

void test("retry updates the task immediately, blocks repeated clicks and remains queued while the page refresh is slow", () => {
  interact(String.raw`
const {renderToStaticMarkup}=await import("react-dom/server");
const prerender=document.createElement("template");prerender.innerHTML=renderToStaticMarkup(React.createElement(UnifiedTaskList,{result:initialResult}));
assert.deepEqual([...prerender.content.querySelectorAll("tbody tr:first-child td")].map(cell=>cell.getAttribute("data-mobile-label")),["任务","状态与进度","关联文章","更新时间","操作"]);
await mount();const retry=button(row(),"重试");assert.ok(retry);assert.equal(status(row()),"失败");
await act(async()=>{retry.click();retry.click();});
assert.equal(fx.calls.length,1);assert.equal(status(row()),"正在提交重试");assert.equal(retry.disabled,true);assert.ok(!row().textContent.includes("上次执行失败 1"));
assert.equal(status(row(2)),"失败");assert.equal(button(row(2),"重试").disabled,false);
await settleAction({data:{id:1}});
assert.equal(fx.refreshCount,1);assert.equal(status(row()),"已加入队列");assert.equal(retry.disabled,true);assert.ok(!row().textContent.includes("上次执行失败 1"));
await act(async()=>retry.click());assert.equal(fx.calls.length,1);
await deliver(makeResult([{...makeTask(1),status:"running",progress:15,error:null,description:"正在翻译正文",canRetry:false},makeTask(2)]));
assert.equal(status(row()),"运行中");assert.ok(row().textContent.includes("15%"));assert.ok(!row().textContent.includes("正在提交"));
assert.deepEqual([...row().querySelectorAll("td")].map(cell=>cell.getAttribute("data-mobile-label")),["任务","状态与进度","关联文章","更新时间","操作"]);
`);
});

void test("a rejected or interrupted retry restores the original task and allows another attempt", () => {
  for (const rejection of ["result", "throw"]) {
    interact(
      `const rejection=${JSON.stringify(rejection)};\n` +
        String.raw`
await mount();await act(async()=>button(row(),"重试").click());assert.equal(status(row()),"正在提交重试");
await act(async()=>{if(rejection==="result")fx.request.resolve({error:"队列暂时不可用"});else fx.request.reject(new Error("网络连接中断"));});
assert.equal(status(row()),"失败");assert.ok(row().textContent.includes("上次执行失败 1"));assert.equal(button(row(),"重试").disabled,false);assert.equal(fx.refreshCount,0);assert.ok(fx.toasts.some(item=>item.kind==="error"));
fx.request=deferred();await act(async()=>button(row(),"重试").click());assert.equal(fx.calls.length,2);assert.equal(status(row()),"正在提交重试");await settleAction({error:"测试结束"});
`,
    );
  }
});

void test("successful retry reconciles with filtering and fast terminal server states", () => {
  for (const terminal of ["succeeded", "failed", "removed"]) {
    interact(
      `const terminal=${JSON.stringify(terminal)};\n` +
        String.raw`
initialResult.filters.status="failed";await mount();await act(async()=>button(row(),"重试").click());await settleAction({data:{id:1}});assert.equal(status(row()),"已加入队列");
const next=terminal==="removed"?[makeTask(2)]:[{...makeTask(1),status:terminal,description:"新的执行结果",error:terminal==="failed"?"新一次失败":null,canRetry:terminal==="failed"},makeTask(2)];
await deliver(makeResult(next));
if(terminal==="removed")assert.equal(row(),undefined);else {assert.equal(status(row()),terminal==="failed"?"失败":"成功");assert.ok(!row().textContent.includes("上次执行失败 1"));if(terminal==="failed")assert.equal(button(row(),"重试").disabled,false);}
`,
    );
  }
});

void test("cancel, resolve and confirmed delete share the same immediate feedback lifecycle", () => {
  for (const [
    operation,
    initialStatus,
    label,
    submitting,
    accepted,
    finalStatus,
  ] of [
    ["cancel", "pending", "取消", "正在取消任务", "已取消", "cancelled"],
    [
      "resolve",
      "manual_required",
      "标记完成",
      "正在标记完成",
      "已标记完成",
      "succeeded",
    ],
    ["delete", "failed", "删除", "正在删除任务", "已删除", "removed"],
  ] as const) {
    interact(
      `const scenario=${JSON.stringify({ operation, initialStatus, label, submitting, accepted, finalStatus })};\n` +
        String.raw`
initialResult=makeResult([{...makeTask(1,"ai",scenario.initialStatus),error:null},makeTask(2)]);await mount();
await act(async()=>button(row(),scenario.label).click());
if(scenario.operation==="delete"){assert.equal(fx.calls.length,0);await act(async()=>button(document,"确定删除").click());}
assert.equal(fx.calls.length,1);assert.equal(fx.calls[0].operation,scenario.operation);assert.equal(status(row()),scenario.submitting);
await settleAction({data:{id:1}});assert.equal(status(row()),scenario.accepted);
await deliver(makeResult(scenario.finalStatus==="removed"?[makeTask(2)]:[{...makeTask(1),status:scenario.finalStatus,error:null,canRetry:scenario.finalStatus==="cancelled"},makeTask(2)]));
if(scenario.finalStatus==="removed")assert.equal(row(),undefined);else assert.equal(status(row()),scenario.finalStatus==="cancelled"?"已取消":"成功");
`,
    );
  }
});

void test("uncertain cover retries still require confirmation and supplier retries describe a new run", () => {
  interact(String.raw`
initialResult=makeResult([makeTask(1,"cover","uncertain")]);await mount();await act(async()=>button(row(),"确认后重试").click());assert.equal(fx.calls.length,0);assert.equal(status(row()),"结果不确定");
await act(async()=>button(document,"我已确认，继续重试").click());assert.equal(status(row()),"正在提交重试");await settleAction({success:true});assert.equal(status(row()),"已加入队列");
await deliver(makeResult([{...makeTask(1,"cover","pending"),error:null}]));assert.equal(status(row()),"排队");
`);
  interact(String.raw`
initialResult=makeResult([makeTask(1,"offer")]);await mount();await act(async()=>button(row(),"重试").click());await settleAction({success:true,message:"复用已有排队任务"});
assert.equal(status(row()),"已提交新运行");assert.ok(row().textContent.includes("新的采集运行已提交"));assert.ok(!row().textContent.includes("上次执行失败"));
await deliver(makeResult([makeTask(1,"offer"),{...makeTask(3,"offer","running"),error:null}]));assert.equal(status(row()),"失败");assert.equal(status(row(3)),"运行中");
`);
});

void test("the shared mutation hook keeps its business-key lock until refreshed UI commits", () => {
  interact(String.raw`
let capturedMutate,latestApi;
const options={key:"entry:1",action:()=>{fx.calls.push("request");return fx.request.promise;}};
function Controls(){const api=useAdminMutation();latestApi=api;capturedMutate??=api.mutate;return React.createElement("button",{disabled:api.isPending("entry:1"),onClick:()=>void api.mutate(options)},api.isPending("entry:1")?"Pending":"Ready");}
function Gate({version}){if(version>fx.deliveredVersion)throw fx.refresh.promise;return React.createElement(Controls);}
function HookApp(){const [version,setVersion]=React.useState(0);fx.setVersion=setVersion;return React.createElement(React.Suspense,{fallback:"Loading"},React.createElement(Gate,{version}));}
await act(async()=>root.render(React.createElement(HookApp)));
await act(async()=>{container.querySelector("button").click();container.querySelector("button").click();});assert.equal(fx.calls.length,1);
await settleAction({success:true});assert.equal(container.querySelector("button").disabled,true);
let duplicate;await act(async()=>{duplicate=await capturedMutate(options);});assert.equal(duplicate.status,"duplicate");assert.equal(fx.calls.length,1);
await deliver(null);assert.equal(container.querySelector("button").disabled,false);
fx.request=deferred();await act(async()=>{void capturedMutate({...options,refresh:false});});assert.equal(fx.calls.length,2);await settleAction({success:true});assert.equal(latestApi.isAnyPending,false);
  `);
});

void test("a failed row unlocks independently while another mutation is still waiting", () => {
  interact(String.raw`
const a=deferred(),b=deferred();let latestApi;
function Controls(){const api=useAdminMutation();latestApi=api;return React.createElement("div",null,...[["a",a],["b",b]].map(([key,request])=>React.createElement("button",{key,"data-key":key,disabled:api.isPending(key),onClick:()=>void api.mutate({key,refresh:false,action:()=>request.promise})},key)));}
await act(async()=>root.render(React.createElement(Controls)));
const first=container.querySelector('[data-key="a"]'),second=container.querySelector('[data-key="b"]');
await act(async()=>{first.click();second.click();});assert.equal(first.disabled,true);assert.equal(second.disabled,true);
await act(async()=>a.resolve({error:"第一项失败"}));assert.equal(first.disabled,false);assert.equal(second.disabled,true);
await act(async()=>b.resolve({success:true}));assert.equal(second.disabled,false);assert.equal(latestApi.isAnyPending,false);
`);
});

void test("task polling waits for the current page refresh and pauses when the page is hidden", () => {
  interact(
    String.raw`
const callbacks=new Map();let timerId=0;
window.setInterval=callback=>{const id=++timerId;callbacks.set(id,callback);return id;};window.clearInterval=id=>callbacks.delete(id);
Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});
const {TaskDetailAutoRefresh}=await import("./src/features/cms/components/task-detail-auto-refresh.tsx");
function Gate({version}){if(version>fx.deliveredVersion)throw fx.refresh.promise;return React.createElement(TaskDetailAutoRefresh,{enabled:true,intervalMs:50});}
function PollApp(){const [version,setVersion]=React.useState(0);fx.setVersion=setVersion;return React.createElement(React.Suspense,{fallback:"Loading"},React.createElement(Gate,{version}));}
await act(async()=>root.render(React.createElement(PollApp)));assert.equal(callbacks.size,1);
await act(async()=>{for(const callback of callbacks.values())callback();});assert.equal(fx.refreshCount,1);assert.equal(callbacks.size,0);
await act(async()=>document.dispatchEvent(new Event("visibilitychange")));assert.equal(fx.refreshCount,1);
await deliver(null);assert.equal(callbacks.size,1);
Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});await act(async()=>{for(const callback of callbacks.values())callback();});assert.equal(fx.refreshCount,1);
await act(async()=>root.render(null));assert.equal(callbacks.size,0);
`,
    { polling: true },
  );
});
