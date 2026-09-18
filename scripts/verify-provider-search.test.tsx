import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Run the real server page and client table together, with controllable route
// delivery so a search can remain suspended while the operator keeps typing.
const fixture = String.raw`
import assert from "node:assert/strict";
import {mock} from "bun:test";
import {Window} from "happy-dom";
const win = new Window({url:"http://localhost:3100/collect/aff-man?pageNo=2&filter=with-aff&sort=name-asc"});
if (!("rows" in win.HTMLTableSectionElement.prototype)) Object.defineProperty(win.HTMLTableSectionElement.prototype, "rows", {get(){return this.querySelectorAll(":scope > tr");}});
for (const key of ["window","document","navigator","HTMLElement","Element","Node","NodeFilter","Event","MouseEvent","PointerEvent","KeyboardEvent","CompositionEvent","CustomEvent","DocumentFragment","MutationObserver","ResizeObserver","IntersectionObserver","HTMLInputElement","HTMLButtonElement","HTMLFormElement","HTMLSelectElement","HTMLTextAreaElement"]) {
  const value = key === "window" ? win : win[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, {value, configurable:true, writable:true});
}
for (const key of ["getComputedStyle","requestAnimationFrame","cancelAnimationFrame"]) globalThis[key] = win[key].bind(win);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react"), {act} = React, {createRoot} = await import("react-dom/client");
let now = 0, timerId = 0;
const timers = new Map();
win.setTimeout = (callback, delay) => {const id = ++timerId; timers.set(id, {callback, at:now + delay}); return id;};
win.clearTimeout = id => timers.delete(id);
async function advance(ms) {
  now += ms;
  await act(async () => {
    for (const [id, timer] of [...timers]) if (timer.at <= now) {timers.delete(id); timer.callback();}
  });
}
function deferred() {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};}
const fx = {params:new URLSearchParams(win.location.search), requests:[], delivered:0, tree:null, wait:null, setVersion:null};
const router = {replace(href, options) {fx.requests.push({href, options}); fx.wait = deferred(); fx.setVersion(value => value + 1);}, refresh(){}};
mock.module("next/navigation", () => ({useRouter:() => router, usePathname:() => "/collect/aff-man", useSearchParams:() => fx.params}));
const provider = {id:21,name:"RackNerd",officialUrl:"racknerd.com",affUrl:"",affParam:"",affValue:"",offerAffUrl:"",offerAffParam:"",offerAffValue:"",offerAffiliateMode:"query_param",offerAffiliateProductParam:null,summary:null,refundPolicy:null,prohibitedUses:null};
mock.module("@/features/cms/actions/aff-provider", () => ({getAffProviderCount:async () => ({data:60}), getAffProviderList:async () => ({data:[provider]}), addAffProvider:async () => {}, deleteAffProvider:async () => {}, deleteAffProviders:async () => {}, updateAffProvider:async () => {}}));
mock.module("@/features/cms/actions/provider-profiles", () => ({getProviderProfileWorkspace:async () => ({promoCodes:[], latestSnapshots:[]})}));
mock.module("@/features/cms/components/provider-profile-sheet", () => ({ProviderProfileSheet:() => null}));
const {default:Page} = await import("./src/features/cms/routes/admin/collect/aff-man/page.tsx");
async function pageTree(params) {
  const page = Page({searchParams:Promise.resolve(Object.fromEntries(params))});
  return page.props.children.type(page.props.children.props);
}
function Screen({version}) {if (version > fx.delivered) throw fx.wait.promise; return fx.tree;}
function App() {const [version, setVersion] = React.useState(0); fx.setVersion = setVersion; return React.createElement(React.Suspense, {fallback:React.createElement("p", {id:"loading"}, "Loading")}, React.createElement(Screen, {version}));}
const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
const input = () => document.querySelector('input[placeholder="搜索商家名、官网域名或返利链接"]');
async function type(value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(input(), value);
    input().dispatchEvent(new win.Event("input", {bubbles:true}));
  });
}
async function compose(type, data = "") {await act(async () => input().dispatchEvent(new win.CompositionEvent(type, {bubbles:true, data})));}
async function deliver() {
  fx.params = new URL(fx.requests.at(-1).href, win.location.origin).searchParams;
  fx.tree = await pageTree(fx.params); fx.delivered = fx.requests.length;
  await act(async () => fx.wait.resolve());
}
async function navigate(search) {
  fx.params = new URLSearchParams(search); fx.tree = await pageTree(fx.params);
  await act(async () => root.render(React.createElement(App)));
}
const warnings = [], originalError = console.error;
console.error = (...args) => {const message = args.map(String).join(" "); if (/not wrapped in act|Cannot update a component|outside a transition/i.test(message)) warnings.push(message); originalError(...args);};
fx.tree = await pageTree(fx.params);
await act(async () => root.render(React.createElement(App)));
input().focus();
`;

function interact(source: string) {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 20_000,
    input:
      fixture +
      "\ntry {\n" +
      source +
      String.raw`
} finally {
  await act(async () => root.unmount());
  await win.happyDOM.cancelAsync(); win.close();
}
assert.deepEqual(warnings, []);
`,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

void test("provider search debounces, serializes slow navigation and keeps newer text and focus across page reset", () => {
  interact(String.raw`
const originalInput = input();
await act(async () => document.querySelector('tbody [role="checkbox"]').click());
await type("R"); await advance(200); await type("Rack"); await advance(399);
assert.equal(fx.requests.length, 0);
await advance(1); assert.equal(fx.requests.length, 1);
const target = new URL(fx.requests[0].href, win.location.origin);
assert.equal(target.searchParams.get("query"), "Rack");
assert.equal(target.searchParams.get("pageNo"), null);
assert.equal(target.searchParams.get("filter"), "with-aff");
assert.equal(target.searchParams.get("sort"), "name-asc");
assert.equal(fx.requests[0].options.scroll, false);
assert.equal(document.querySelector("#loading"), null);
assert.equal(document.activeElement, originalInput);
await type("RackNerd"); await advance(2000);
assert.equal(fx.requests.length, 1, "Do not overlap requests while route data is pending");
await deliver();
assert.equal(input(), originalInput, "Even a page 2 to page 1 search must retain the input node");
assert.equal(document.activeElement, originalInput);
assert.equal(input().value, "RackNerd", "Old results must not overwrite newer typing");
assert.equal(document.querySelector('tbody [role="checkbox"]').getAttribute("aria-checked"), "false");
await advance(400); assert.equal(fx.requests.length, 2);
assert.equal(new URL(fx.requests[1].href, win.location.origin).searchParams.get("query"), "RackNerd");
await deliver(); await advance(2000); assert.equal(fx.requests.length, 2, "No duplicate search after delivery");
assert.equal(document.activeElement, originalInput);
`);
});

void test("provider search waits for Chinese composition and clears a pending search without restoring stale text", () => {
  interact(String.raw`
await compose("compositionstart"); await type("gong"); await advance(2000);
assert.equal(fx.requests.length, 0, "Uncommitted IME input must not be searched");
await type("供应商"); await compose("compositionend", "供应商");
await advance(399); assert.equal(fx.requests.length, 0);
await advance(1); assert.equal(fx.requests.length, 1);
assert.equal(new URL(fx.requests[0].href, win.location.origin).searchParams.get("query"), "供应商");
await act(async () => document.querySelector('[aria-label="清空搜索"]').click());
await advance(1000); assert.equal(fx.requests.length, 1);
await deliver(); assert.equal(input().value, "");
await advance(400); assert.equal(fx.requests.length, 2);
assert.equal(new URL(fx.requests[1].href, win.location.origin).searchParams.get("query"), null);
await deliver(); await advance(1000); assert.equal(fx.requests.length, 2);
await type("Rack "); await advance(100); await compose("compositionstart"); await advance(1000);
assert.equal(fx.requests.length, 2, "Starting composition cancels an existing debounce");
`);
});

void test("provider search follows history queries, avoids whitespace-only requests and cancels on unmount", () => {
  interact(String.raw`
await type("Rack"); await advance(400); await deliver();
await navigate("query=Other&filter=empty-aff&sort=id-asc&pageNo=2");
assert.equal(input().value, "Other");
assert.deepEqual([...document.querySelectorAll('[role="combobox"]')].map(node => node.textContent), ["未配置返利", "ID 从旧到新"]);
await advance(1000); assert.equal(fx.requests.length, 1);
await navigate("query=Rack"); assert.equal(input().value, "Rack");
await type(" Rack "); await advance(1000); assert.equal(fx.requests.length, 1);
await type("Pending"); await act(async () => root.render(null)); await advance(1000);
assert.equal(fx.requests.length, 1, "Leaving the page must cancel queued navigation");
`);
});
