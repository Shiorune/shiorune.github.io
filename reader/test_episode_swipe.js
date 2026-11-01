"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "reader.js"), "utf8");

// Execute the real end-of-page touch handlers, not a reimplementation.
const start = source.indexOf('    const nextChapter = el("episode-next-link");');
const end = source.indexOf("\n  } else {", start);
assert(start >= 0 && end > start, "native chapter navigation must live in the episode branch");
const behavior = source.slice(start, end);
const targetHref = "https://shiorune.github.io/works/revalna/episodes/002.html";

class FakeElement {
  constructor(kind = "reading") { this.kind = kind; }
  closest(selector) {
    if (selector === ".reading-area") return this.kind === "outside" ? null : this;
    if (selector.startsWith("a, button")) return this.kind === "link" ? this : null;
    return null;
  }
}

function harness(options = {}) {
  const handlers = new Map();
  const navigations = [], scheduled = [], fetched = [], cacheWrites = [];
  let clock = 0, progressUpdates = 0;
  const link = {href: targetHref};
  const doc = {
    scrollingElement: {scrollHeight: 2000},
    documentElement: {scrollHeight: 2000},
    addEventListener(name, listener, config) {
      assert.equal(config.passive, true, "native page scroll must never be cancelled");
      handlers.set(name, listener);
    }
  };
  const context = {
    Element: FakeElement,
    document: doc,
    innerHeight: 844,
    scrollY: options.scrollY === undefined ? 1156 : options.scrollY,
    el(id) { return id === "episode-next-link" && !options.noNext ? link : null; },
    openOverlays: options.overlays || 0,
    performance: {now() {return clock;}},
    navigator: {onLine: !options.offline, connection: options.connection || {}},
    location: {assign(url) {navigations.push(url);}},
    updateProgress() {progressUpdates++;},
    fetch: async url => {
      fetched.push(url);
      return {ok:true, type:"basic", clone() {return {copy:true};}};
    },
    caches: {async open(name) {
      assert.equal(name, "velune-episodes-v1");
      return {async put(url, response) {cacheWrites.push([url,response]);}};
    }},
    window: {requestIdleCallback:true, caches:true},
    requestIdleCallback(fn) {scheduled.push(fn);},
    setTimeout() {throw Error("unexpected fallback timer");}
  };
  vm.runInNewContext(behavior, context);
  function touch(x, y, id = 1) {return {clientX:x,clientY:y,identifier:id};}
  function gesture({x0=180,y0=700,x1=180,y1=560,duration=240,
                    kind="reading",cancel=false,multi=false,
                    bottomAtStart,bottomAtEnd} = {}) {
    const original = context.scrollY;
    if (bottomAtStart !== undefined) context.scrollY = bottomAtStart ? 1156 : 500;
    clock = 0;
    const initial = touch(x0,y0);
    const second = touch(220,660,2);
    const startTouches = multi ? [initial,second] : [initial];
    handlers.get("touchstart")?.({touches:startTouches,target:new FakeElement(kind)});
    if (bottomAtEnd !== undefined) context.scrollY = bottomAtEnd ? 1156 : 500;
    clock = duration;
    if (cancel) handlers.get("touchcancel")?.({});
    handlers.get("touchend")?.({changedTouches:[touch(x1,y1)]});
    context.scrollY = original;
  }
  return {
    context, navigations, scheduled, fetched, cacheWrites, gesture, handlers,
    get progressUpdates() {return progressUpdates;}
  };
}

async function main() {
  const valid = harness();
  valid.gesture();
  assert.deepEqual(valid.navigations,[targetHref], "a second upward swipe from the bottom navigates");
  assert.equal(valid.progressUpdates,1, "reading progress saved before moving");
  assert(!valid.handlers.has("pointerdown"), "no swipe zone or pointer capture used");
  assert(valid.handlers.has("touchstart"), "normal document touch gestures are observed");

  const unsafe = [
    [{y1:650},"short accidental movement"],
    [{y1:740},"downward / pull-to-refresh direction"],
    [{x1:310},"sideways / history navigation gesture"],
    [{duration:40},"too fast"],
    [{duration:1800},"long press"],
    [{cancel:true},"touch cancelled by browser"],
    [{multi:true},"multitouch"],
    [{kind:"outside"},"toolbar instead of reading content"],
    [{kind:"link"},"click on next-link button"],
    [{bottomAtStart:false,bottomAtEnd:true},"merely reached the bottom while scrolling"],
    [{bottomAtStart:true,bottomAtEnd:false},"left the bottom during gesture"]
  ];
  for (const [params, label] of unsafe) {
    const h = harness();
    h.gesture(params);
    assert.deepEqual(h.navigations,[], "must not navigate: "+label);
  }
  const overlay = harness({overlays:1});
  overlay.gesture();
  assert.deepEqual(overlay.navigations,[], "settings/TOC overlays block navigation");
  const last = harness({noNext:true});
  assert.equal(last.handlers.size,0,"last chapter registers no gesture listeners");

  const prefetch = harness();
  assert.equal(prefetch.scheduled.length,1,"one chapter scheduled for cache prefetch");
  prefetch.scheduled[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prefetch.fetched,[targetHref]);
  assert.equal(prefetch.cacheWrites.length,1);
  assert.equal(prefetch.cacheWrites[0][0],targetHref);

  for (const options of [{offline:true},{connection:{saveData:true}},
                         {connection:{effectiveType:"2g"}}]) {
    const h = harness(options);
    assert.equal(h.scheduled.length,0,"no preload on slow/offline/data-saving connection");
  }
  console.log("PASS: native bottom pull, unsafe gestures, overlays, final chapter and prefetch");
}
main().catch(err => {console.error(err);process.exitCode=1;});
