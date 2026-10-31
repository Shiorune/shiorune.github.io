"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "reader.js"), "utf8");

// Exercise the actual handler code with simulated browser pointer events.
const start = source.indexOf('    const nextChapter = el("episode-next-link");');
const end = source.indexOf("\n  } else {", start);
assert(start >= 0 && end > start, "chapter swipe code must remain in the episode branch");
const behavior = source.slice(start, end);
const targetHref = "https://shiorune.github.io/works/revalna/episodes/002.html";

function harness(options = {}) {
  const handlers = new Map();
  const navigations = [], scheduled = [], fetched = [], cacheWrites = [];
  const swipeZone = {
    addEventListener(name, listener) { handlers.set(name, listener); },
    getBoundingClientRect() { return options.rect || {top: 660, bottom: 770}; },
    setPointerCapture(id) { assert.equal(typeof id, "number"); }
  };
  const link = {href: targetHref};
  let clock = 0, progressUpdates = 0;
  const context = {
    el(id) { return options.noNext ? null : (id === "episode-next-link" ? link :
      id === "episode-swipe-zone" ? swipeZone : null); },
    openOverlays: options.overlays || 0,
    innerHeight: 844,
    performance: {now() { return clock; }},
    navigator: {onLine: options.offline ? false : true, connection: options.connection || {}},
    location: {assign(url) { navigations.push(url); }},
    updateProgress() { progressUpdates++; },
    fetch: async url => {
      fetched.push(url);
      return {ok: true, type: "basic", clone() { return {copy: true}; }};
    },
    caches: {
      async open(name) {
        assert.equal(name, "velune-episodes-v1");
        return {async put(url, response) { cacheWrites.push([url, response]); }};
      }
    },
    window: {requestIdleCallback: true, caches: true},
    requestIdleCallback(fn) { scheduled.push(fn); },
    setTimeout() { throw Error("idle callback should be used"); }
  };
  vm.runInNewContext(behavior, context);
  function fire(name, {x = 180, y = 730, id = 1, type = "touch", primary = true} = {}) {
    handlers.get(name)?.({clientX:x, clientY:y, pointerId:id, pointerType:type, isPrimary:primary});
  }
  function gesture({x0 = 180, y0 = 720, x1 = 180, y1 = 620, duration = 200,
    type = "touch", primary = true, cancel = false} = {}) {
    clock = 0;
    fire("pointerdown", {x:x0,y:y0,type,primary});
    clock = duration;
    if (cancel) fire("pointercancel");
    fire("pointerup", {x:x1,y:y1,type,primary});
  }
  return {
    context, navigations, scheduled, fetched, cacheWrites, gesture,
    get progressUpdates() {return progressUpdates;},
    handlers
  };
}
async function main() {
  const ok = harness();
  ok.gesture();
  assert.deepEqual(ok.navigations, [targetHref], "intentional upward swipe navigates once");
  assert.equal(ok.progressUpdates, 1, "commit reading progress before navigating");

  for (const bad of [
    {y1:680},                   // short, accidental swipe
    {y1:780},                   // downward pull / browser refresh direction
    {x1:280},                   // horizontal browser history/back swipe
    {type:"mouse"},            // mouse dragging is not a swipe
    {primary:false},           // two-finger input
    {duration:40},             // abrupt accidental tap motion
    {duration:2000},           // very slow scroll/press
    {cancel:true}              // gesture taken over by the browser
  ]) {
    const t = harness();
    t.gesture(bad);
    assert.deepEqual(t.navigations, [], "unsafe gesture must not navigate: " + JSON.stringify(bad));
  }
  const obscured = harness({rect:{top:720,bottom:950}});
  obscured.gesture();
  assert.deepEqual(obscured.navigations, [], "partially hidden rail does not navigate");
  const modal = harness({overlays:1});
  modal.gesture();
  assert.deepEqual(modal.navigations, [], "overlay blocks chapter gesture");
  const last = harness({noNext:true});
  assert.equal(last.handlers.size, 0, "last chapter cannot register a next swipe");

  const prefetch = harness();
  assert.equal(prefetch.scheduled.length, 1, "one next chapter queued during idle");
  prefetch.scheduled[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prefetch.fetched, [targetHref]);
  assert.equal(prefetch.cacheWrites.length, 1);
  assert.equal(prefetch.cacheWrites[0][0], targetHref);

  for (const options of [{offline:true},{connection:{saveData:true}},
    {connection:{effectiveType:"2g"}}]) {
    const h = harness(options);
    assert.equal(h.scheduled.length, 0, "do not fetch on slow/offline/data-saver");
    assert.equal(h.cacheWrites.length, 0);
  }
  console.log("PASS: swipe safety, browser gestures, modal/boundary, tap fallback and single-chapter prefetch");
}
main().catch(err => {console.error(err); process.exitCode=1;});
