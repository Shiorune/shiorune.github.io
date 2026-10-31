(() => {
  "use strict";
  const OLD_ORIGIN = "https://pino1472.github.io";
  const OLD_BRIDGE = OLD_ORIGIN + "/Velune/migrate.html";
  const TRANSFER_TYPE = "shiorune:reading-transfer:v1";
  const button = document.getElementById("import-old-reading");
  const status = document.getElementById("import-status");
  if (!button || !status) return;

  let popup = null;
  let transferring = false;

  // Only novel reading data is eligible. No arbitrary localStorage keys or
  // secrets are requested or transferred.
  const episode = /^\/Velune\/works\/([a-z0-9][a-z0-9_-]{0,63})\/episodes\/([0-9]+)\.html$/;
  function migratedPath(path) {
    if (typeof path !== "string" || !episode.test(path)) return null;
    return path.slice("/Velune".length);
  }
  function migrateEntry(key, stored) {
    if (typeof key !== "string" || typeof stored !== "string" || stored.length > 20000) return null;
    let val;
    try { val = JSON.parse(stored); } catch { return null; }

    if (key === "velune-reader-settings-v2" || key === "velune-reader-settings-v1") {
      if (!val || typeof val !== "object" || Array.isArray(val)) return null;
      const clean = {};
      if (typeof val.font === "string" && val.font.length < 40) clean.font = val.font;
      if (typeof val.theme === "string" && val.theme.length < 40) clean.theme = val.theme;
      if (typeof val.customColor === "string" && /^#[0-9a-fA-F]{6}$/.test(val.customColor))
        clean.customColor = val.customColor;
      if (typeof val.fontSize === "number" && Number.isFinite(val.fontSize))
        clean.fontSize = Math.min(28, Math.max(14, val.fontSize));
      if (typeof val.lineHeight === "number" && Number.isFinite(val.lineHeight))
        clean.lineHeight = Math.min(2.6, Math.max(1.4, val.lineHeight));
      return [key, JSON.stringify(clean)];
    }

    if (key === "velune-reader-last-v2" || key === "velune-reader-last") {
      const path = migratedPath(val?.path);
      if (!path) return null;
      return [key, JSON.stringify({path, title: typeof val.title === "string" ? val.title.slice(0, 160) : ""})];
    }

    for (const prefix of ["velune-reading-progress-v1:", "velune-reader-scroll:"]) {
      if (!key.startsWith(prefix)) continue;
      const path = migratedPath(key.slice(prefix.length));
      if (!path) return null;
      if (prefix === "velune-reading-progress-v1:") {
        if (!val || typeof val !== "object") return null;
        const percent = Number(val.percent);
        return [prefix + path, JSON.stringify({
          percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
          finished: val.finished === true
        })];
      }
      if (!Number.isFinite(val) || val < 0 || val > 10000000) return null;
      return [prefix + path, JSON.stringify(val)];
    }
    return null;
  }

  try {
    const prior = sessionStorage.getItem("shiorune-migration-result");
    if (prior) {
      sessionStorage.removeItem("shiorune-migration-result");
      status.textContent = prior;
    }
  } catch {}

  button.addEventListener("click", () => {
    if (transferring) return;
    // Open synchronously within the user's click, so popup blockers permit it.
    popup = window.open(OLD_BRIDGE, "shiorune-reading-migration",
      "width=460,height=600");
    if (!popup) {
      status.textContent = "別ウィンドウを開けません。ブラウザのポップアップ設定をご確認ください。";
      return;
    }
    transferring = true;
    button.disabled = true;
    status.textContent = "旧Veluneから読書記録を取得しています…";
  });

  window.addEventListener("message", event => {
    if (!transferring || !popup || event.source !== popup ||
        event.origin !== OLD_ORIGIN ||
        event.data?.type !== TRANSFER_TYPE || !Array.isArray(event.data.entries)) return;

    const entries = event.data.entries;
    if (entries.length > 1200 || JSON.stringify(entries).length > 1000000) {
      status.textContent = "移行データが大きすぎるため、安全のため中止しました。";
      button.disabled = false;
      transferring = false;
      return;
    }

    const staged = [];
    for (const item of entries) {
      if (!Array.isArray(item) || item.length !== 2) continue;
      const checked = migrateEntry(item[0], item[1]);
      if (checked) staged.push(checked);
    }
    try {
      // Preserve already saved progress at the destination if the source has
      // not read the chapter. Settings are replaced by explicit user choice.
      for (const [key, value] of staged) {
        if (key.startsWith("velune-reading-progress-v1:") ||
            key.startsWith("velune-reader-scroll:")) {
          if (localStorage.getItem(key) !== null) continue;
        }
        localStorage.setItem(key, value);
      }
      event.source.postMessage({type: TRANSFER_TYPE + ":done"}, OLD_ORIGIN);
      const result = staged.length
        ? "読書記録 " + staged.length + "件を引き継ぎました。"
        : "旧サイトに引き継げる読書記録はありませんでした。";
      try { sessionStorage.setItem("shiorune-migration-result", result); } catch {}
      location.reload();
    } catch {
      status.textContent = "データを保存できませんでした。プライベートモードや容量制限をご確認ください。";
      button.disabled = false;
      transferring = false;
    }
  });
})();
