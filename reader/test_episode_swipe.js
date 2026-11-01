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
const previousHref = "https://shiorune.github.io/works/revalna/episodes/000.html";

class FakeElement {
  constructor(kind = "reading") { this.kind = kind; }
  closest(selector) {
    if (selector === ".reading-area") return this.kind === "outside" ? null : this;
    if (selector.startsWith("button, input")) return this.kind === "button" ? this : null;
    return null;
  }
}

function harness(options = {}) {
  const handlers = new Map();
  const navigations = [], scheduled = [], fetched = [], cacheWrites = [];
  let clock = 0, progressUpdates = 0, prevented = 0;
  const link = {href: targetHref};
  const previousLink = {href: previousHref};
  const doc = {
    scrollingElement: {scrollHeight: 2000},
    documentElement: {scrollHeight: 2000},
    querySelector(selector) {
      assert.equal(selector, ".episode-top-navigation .episode-prev-link");
      return options.noPrevious ? null : previousLink;
    },
    addEventListener(name, listener, config) {
      assert.equal(config.passive, name !== "touchmove",
        "only top-edge touchmove may prevent browser pull-to-refresh");
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
                    topAtStart,topAtEnd,bottomAtStart,bottomAtEnd} = {}) {
    const original = context.scrollY;
    if (topAtStart !== undefined) context.scrollY = topAtStart ? 0 : 500;
    else if (bottomAtStart !== undefined) context.scrollY = bottomAtStart ? 1156 : 500;
    clock = 0;
    const initial = touch(x0,y0);
    const second = touch(220,660,2);
    const startTouches = multi ? [initial,second] : [initial];
    handlers.get("touchstart")?.({touches:startTouches,target:new FakeElement(kind)});
    if (topAtEnd !== undefined) context.scrollY = topAtEnd ? 0 : 500;
    else if (bottomAtEnd !== undefined) context.scrollY = bottomAtEnd ? 1156 : 500;
    clock = duration / 2;
    const middle = touch((x0+x1)/2,(y0+y1)/2);
    handlers.get("touchmove")?.({
      touches:multi ? [middle, second] : [middle], cancelable:true,
      preventDefault() {prevented++;}
    });
    clock = duration;
    if (cancel) handlers.get("touchcancel")?.({});
    handlers.get("touchend")?.({changedTouches:[touch(x1,y1)]});
    context.scrollY = original;
  }
  return {
    context, navigations, scheduled, fetched, cacheWrites, gesture, handlers,
    get progressUpdates() {return progressUpdates;},
    get prevented() {return prevented;}
  };
}

async function main() {
  const valid = harness();
  valid.gesture();
  assert.deepEqual(valid.navigations,[targetHref], "a second upward swipe from the bottom navigates");
  assert.equal(valid.progressUpdates,1, "reading progress saved before moving");
  assert(!valid.handlers.has("pointerdown"), "no swipe zone or pointer capture used");
  assert(valid.handlers.has("touchstart"), "normal document touch gestures are observed");
  const fromChapterLink = harness();
  fromChapterLink.gesture({kind:"link"});
  assert.deepEqual(fromChapterLink.navigations,[targetHref],
    "swiping upward on the chapter-end link follows the same native scroll gesture");
  const linkTap = harness();
  linkTap.gesture({kind:"link",y1:690});
  assert.deepEqual(linkTap.navigations,[],
    "tapping the next chapter link is not intercepted; native href remains usable");
  const disabledButton = harness();
  disabledButton.gesture({kind:"button"});
  assert.deepEqual(disabledButton.navigations,[],
    "settings/other interactive controls must not trigger episode navigation");

  // A NEW downward pull from the document top opens the previous chapter.
  const previous = harness({scrollY:0});
  previous.gesture({y0:240,y1:380});
  assert.deepEqual(previous.navigations,[previousHref]);
  assert.equal(previous.progressUpdates,1);
  assert.equal(previous.prevented,1,"block browser pull-to-refresh only at top");
  const fromPreviousLink = harness({scrollY:0});
  fromPreviousLink.gesture({kind:"link",y0:240,y1:380});
  assert.deepEqual(fromPreviousLink.navigations,[previousHref]);
  const prevTap = harness({scrollY:0});
  prevTap.gesture({kind:"link",y0:240,y1:245});
  assert.deepEqual(prevTap.navigations,[],"ordinary previous-link tap is untouched");
  assert.equal(prevTap.prevented,0);
  const noPrevious = harness({scrollY:0,noPrevious:true});
  noPrevious.gesture({y0:240,y1:380});
  assert.deepEqual(noPrevious.navigations,[],"first chapter must not navigate backward");
  assert.equal(noPrevious.prevented,0);
  const justReachedTop = harness({scrollY:500});
  justReachedTop.gesture({y0:240,y1:380,topAtEnd:true});
  assert.deepEqual(justReachedTop.navigations,[],
    "reaching the top in the same drag is not enough");
  const leftTop = harness({scrollY:0});
  leftTop.gesture({y0:240,y1:380,topAtEnd:false});
  assert.deepEqual(leftTop.navigations,[],
    "must still be at top on touchend");
  assert.equal(leftTop.prevented,0);
  for (const params of [
    {y0:240,y1:290}, {y0:380,y1:240},
    {x0:180,x1:310,y0:240,y1:380},
    {y0:240,y1:380,duration:40}, {y0:240,y1:380,duration:1800},
    {y0:240,y1:380,cancel:true}, {y0:240,y1:380,multi:true},
    {y0:240,y1:380,kind:"outside"}, {y0:240,y1:380,kind:"button"}
  ]) {
    const h = harness({scrollY:0});
    h.gesture(params);
    assert.deepEqual(h.navigations,[],"invalid top-edge gesture must not navigate");
  }
  const topOverlay = harness({scrollY:0,overlays:1});
  topOverlay.gesture({y0:240,y1:380});
  assert.deepEqual(topOverlay.navigations,[]);
  assert.equal(topOverlay.prevented,0,"dialog must not have its scrolling prevented");
  const withoutNeighbors = harness({noNext:true,noPrevious:true});
  assert.equal(withoutNeighbors.handlers.size,0,"isolated episode needs no handlers");

  const unsafe = [
    [{y1:650},"short accidental movement"],
    [{y1:740},"downward / pull-to-refresh direction"],
    [{x1:310},"sideways / history navigation gesture"],
    [{duration:40},"too fast"],
    [{duration:1800},"long press"],
    [{cancel:true},"touch cancelled by browser"],
    [{multi:true},"multitouch"],
    [{kind:"outside"},"toolbar instead of reading content"],
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
  last.gesture();
  assert.deepEqual(last.navigations,[], "last chapter has no next scroll navigation");
  const lastTop = harness({noNext:true,scrollY:0});
  lastTop.gesture({y0:240,y1:380});
  assert.deepEqual(lastTop.navigations,[previousHref], "last chapter can still navigate backward");

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
  console.log("PASS: bidirectional native chapter-edge gestures, refresh guard, taps, overlays and prefetch");
}
main().catch(err => {console.error(err);process.exitCode=1;});
