"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "reader.js"), "utf8");

// Test the actual function used by the reader, without a browser or third-party packages.
const first = source.indexOf("    function resetWorkReadingStatus() {");
const end = source.indexOf("\n\n    renderWorkReadingStatus();", first);
assert(first >= 0 && end > first, "reset function must be present in reader.js");
const resetSource = source.slice(first, end);
const prefix = "velune-reading-progress-v1:";
const lastKey = "velune-reader-last-v2";
const legacyLast = "velune-reader-last";
const novel = "/Velune/works/revalna/episodes/";
const other = "/Velune/works/other/episodes/";
const chapterPaths = [novel + "001.html", novel + "002.html"];
function makeStorage() {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  return {values, storage};
}
function createReset(storage, chapterList = chapterPaths) {
  const context = {
    episodePaths: chapterList, PROGRESS_KEY: prefix, LAST: lastKey, localStorage: storage,
    read(key, fallback) {
      try {const value = storage.getItem(key); return value === null ? fallback : JSON.parse(value);}
      catch {return fallback;}
    }
  };
  return vm.runInNewContext(resetSource + "\nresetWorkReadingStatus;", context);
}

{
  const {values, storage} = makeStorage();
  const settings = '{"fontSize":19,"theme":"night"}';
  storage.setItem("velune-reader-settings-v2", settings);
  storage.setItem("velune-episodes-v1", "offline-placeholder");
  storage.setItem(prefix + chapterPaths[0], '{"percent":72,"finished":false}');
  storage.setItem(prefix + chapterPaths[1], '{"percent":100,"finished":true}');
  storage.setItem("velune-reader-scroll:" + chapterPaths[0], "313");
  storage.setItem("velune-reader-scroll:" + chapterPaths[1], "2222");
  storage.setItem(lastKey, JSON.stringify({path:chapterPaths[0],title:"chapter 1"}));
  storage.setItem(legacyLast, JSON.stringify({path:chapterPaths[1],title:"chapter 2"}));
  storage.setItem(prefix + other + "001.html", '{"percent":100,"finished":true}');
  storage.setItem("velune-reader-scroll:" + other + "001.html", "900");
  assert.equal(createReset(storage)(), true);
  assert.equal(storage.getItem(prefix + chapterPaths[0]), null);
  assert.equal(storage.getItem(prefix + chapterPaths[1]), null);
  assert.equal(storage.getItem("velune-reader-scroll:" + chapterPaths[0]), null);
  assert.equal(storage.getItem("velune-reader-scroll:" + chapterPaths[1]), null);
  assert.equal(storage.getItem(lastKey), null);
  assert.equal(storage.getItem(legacyLast), null);
  assert.equal(storage.getItem(prefix + other + "001.html"), '{"percent":100,"finished":true}');
  assert.equal(storage.getItem("velune-reader-scroll:" + other + "001.html"), "900");
  assert.equal(storage.getItem("velune-reader-settings-v2"), settings);
  assert.equal(storage.getItem("velune-episodes-v1"), "offline-placeholder");
  assert(values.size > 0);
}

{
  const {storage} = makeStorage();
  const outsideLast = JSON.stringify({path:other + "001.html",title:"another work"});
  storage.setItem(lastKey, outsideLast);
  assert.equal(createReset(storage)(), true);
  assert.equal(storage.getItem(lastKey), outsideLast, "other-work continue must survive");
}

{
  const {storage} = makeStorage();
  storage.removeItem = () => {throw new Error("storage denied");};
  assert.equal(createReset(storage)(), false, "storage errors must not report success");
}
console.log("Per-work reset behavior passed: exact keys, other works, settings, failures");
