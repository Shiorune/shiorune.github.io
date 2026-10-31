(() => {
  "use strict";
  const KEY = "velune-reader-settings-v2";
  const LAST = "velune-reader-last-v2";
  const defaults = {font: "meiryo", fontSize: 17, lineHeight: 1.8, theme: "paper", customColor: "#f4edde"};
  const fonts = {
    serif: '"Noto Serif CJK JP","Hiragino Mincho ProN","Yu Mincho","MS PMincho",serif',
    "yu-mincho": '"Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif CJK JP",serif',
    "hiragino-mincho": '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",serif',
    sans: '"Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif',
    meiryo: '"Meiryo UI","Meiryo","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans CJK JP",sans-serif',
    "yu-gothic": '"Yu Gothic UI","Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans CJK JP",sans-serif',
    rounded: '"Hiragino Maru Gothic ProN","Zen Maru Gothic","Arial Rounded MT Bold","Meiryo",sans-serif',
    mono: '"BIZ UDゴシック","BIZ UDGothic","Noto Sans Mono CJK JP","MS Gothic",monospace'
  };
  const palettes = {
    paper: "#f4edde", light: "#ffffff", ivory: "#fff8e7", sand: "#eddfc7",
    rose: "#f9e6eb", peach: "#fae1d5", lavender: "#eae4f5", sky: "#dceef5",
    mint: "#e0f4e9", sage: "#e7edda", slate: "#dce3ea", dark: "#2c3036",
    night: "#171b22", sepia: "#423a31"
  };
  const el = id => document.getElementById(id);
  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }
  const stored = read(KEY, null);
  const legacy = stored === null ? read("velune-reader-settings-v1", null) : null;
  const earlier = stored || legacy;
  const settings = {...defaults, ...(earlier && typeof earlier === "object" ? earlier : {})};
  // Migrate only untouched historical typography defaults; preserve custom settings.
  if (stored === null && legacy && Number(legacy.fontSize) === 18 &&
      Number(legacy.lineHeight) === 1.9) {
    settings.fontSize = defaults.fontSize;
    settings.lineHeight = defaults.lineHeight;
  }

  const readingPresets = {
    compact: {fontSize: 15, lineHeight: 1.6},
    standard: {fontSize: 17, lineHeight: 1.8},
    relaxed: {fontSize: 19, lineHeight: 2.0}
  };
  function luminance(hex) {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    return rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  }
  function apply() {
    if (!(settings.font in fonts)) settings.font = defaults.font;
    if (!(settings.theme in palettes) && settings.theme !== "custom") settings.theme = defaults.theme;
    if (!/^#[0-9a-f]{6}$/i.test(settings.customColor)) settings.customColor = defaults.customColor;
    settings.fontSize = Math.max(14, Math.min(28, Number(settings.fontSize) || defaults.fontSize));
    settings.lineHeight = Math.max(1.4, Math.min(2.6, Number(settings.lineHeight) || defaults.lineHeight));
    const root = document.documentElement;
    const bg = settings.theme === "custom" ? settings.customColor : palettes[settings.theme];
    const isDark = luminance(bg) < 0.24;
    root.dataset.theme = settings.theme;
    root.style.colorScheme = isDark ? "dark" : "light";
    root.style.setProperty("--bg", bg);
    root.style.setProperty("--fg", isDark ? "#f3f0eb" : "#242a2d");
    root.style.setProperty("--muted", isDark ? "#c6c9cd" : "#566069");
    root.style.setProperty("--line", isDark ? "#66696d" : "#c4c7c7");
    root.style.setProperty("--accent", isDark ? "#f1ca92" : "#5a5245");
    root.style.setProperty("--reader-font", fonts[settings.font]);
    root.style.setProperty("--font-size", settings.fontSize + "px");
    root.style.setProperty("--line-height", settings.lineHeight.toFixed(1));
    const nums = {"font-size": settings.fontSize, "line-height": settings.lineHeight};
    Object.entries(nums).forEach(([id, value]) => { if (el(id)) el(id).value = value; });
    if (el("font-value")) el("font-value").textContent = settings.fontSize + "px";
    if (el("line-value")) el("line-value").textContent = settings.lineHeight.toFixed(1);
    document.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === settings.theme; });
    document.querySelectorAll('input[name="font"]').forEach(input => { input.checked = input.value === settings.font; });
    if (el("custom-color")) el("custom-color").value = settings.customColor;
    document.querySelectorAll("[data-reading-preset]").forEach(button => {
      const preset = readingPresets[button.dataset.readingPreset];
      const active = preset && preset.fontSize === settings.fontSize &&
        preset.lineHeight === settings.lineHeight;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  apply();
  // Native dialogs enter the top layer, but mobile browsers can still scroll
  // the underlying page while an inner settings pane is being dragged.
  // Freeze the exact chapter position until all overlays are closed.
  let lockedReaderY = 0;
  let openOverlays = 0;
  function releaseReaderScroll() {
    if (openOverlays === 0) return;
    openOverlays -= 1;
    if (openOverlays !== 0) return;
    document.body.classList.remove("reader-overlay-open");
    document.documentElement.classList.remove("reader-overlay-open");
    document.body.style.top = "";
    window.scrollTo({top: lockedReaderY, behavior: "instant"});
  }
  function openReaderOverlay(element) {
    if (!element || element.open) return;
    if (openOverlays === 0) {
      lockedReaderY = window.scrollY;
      document.body.style.top = "-" + lockedReaderY + "px";
      document.body.classList.add("reader-overlay-open");
      document.documentElement.classList.add("reader-overlay-open");
    }
    openOverlays += 1;
    try {
      element.showModal();
    } catch (error) {
      releaseReaderScroll();
      throw error;
    }
  }
  const dialog = el("settings");
  dialog?.addEventListener("close", releaseReaderScroll);
  const settingsScroller = el("settings-scroll");
  const settingTabs = [...document.querySelectorAll("[data-settings-tab]")];
  function switchSettingsTab(name) {
    const chosen = settingTabs.find(tab => tab.dataset.settingsTab === name);
    if (!chosen) return;
    for (const tab of settingTabs) {
      const selected = tab === chosen;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      const panel = el(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    }
    if (settingsScroller) settingsScroller.scrollTop = 0;
  }
  settingTabs.forEach((tab, i) => {
    tab.addEventListener("click", () => switchSettingsTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", event => {
      let next = i;
      if (event.key === "ArrowRight") next = (i + 1) % settingTabs.length;
      else if (event.key === "ArrowLeft") next = (i + settingTabs.length - 1) % settingTabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = settingTabs.length - 1;
      else return;
      event.preventDefault();
      const target = settingTabs[next];
      switchSettingsTab(target.dataset.settingsTab);
      target.focus();
    });
  });
  el("open-settings")?.addEventListener("click", () => {
    switchSettingsTab("reading");
    openReaderOverlay(dialog);
  });
  el("close-settings")?.addEventListener("click", () => dialog?.close());
  el("done-settings")?.addEventListener("click", () => dialog?.close());
  dialog?.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('input[name="font"]').forEach(input =>
    input.addEventListener("change", event => { settings.font = event.currentTarget.value; apply(); save(KEY, settings); })
  );
  document.querySelectorAll('input[name="theme"]').forEach(input =>
    input.addEventListener("change", event => { settings.theme = event.currentTarget.value; apply(); save(KEY, settings); })
  );
  el("custom-color")?.addEventListener("input", event => {
    settings.customColor = event.currentTarget.value;
    settings.theme = "custom";
    apply();
    save(KEY, settings);
  });
  [
    ["font-size", "fontSize"],
    ["line-height", "lineHeight"]
  ].forEach(([id, prop]) =>
    el(id)?.addEventListener("input", event => {
      settings[prop] = Number(event.currentTarget.value);
      apply();
      save(KEY, settings);
    })
  );
  document.querySelectorAll("[data-reading-preset]").forEach(button =>
    button.addEventListener("click", () => {
      const preset = readingPresets[button.dataset.readingPreset];
      if (!preset) return;
      Object.assign(settings, preset);
      apply();
      save(KEY, settings);
    })
  );
  el("reset-settings")?.addEventListener("click", () => {
    Object.assign(settings, defaults);
    apply();
    save(KEY, settings);
  });

  const tocDialog = el("chapter-list");
  tocDialog?.addEventListener("close", releaseReaderScroll);
  el("open-toc")?.addEventListener("click", event => {
    if (!tocDialog || typeof tocDialog.showModal !== "function") return;
    event.preventDefault();
    openReaderOverlay(tocDialog);
    const active = tocDialog?.querySelector('[aria-current="page"]');
    if (active) requestAnimationFrame(() => active.scrollIntoView({block: "center"}));
  });
  el("close-toc")?.addEventListener("click", () => tocDialog?.close());
  tocDialog?.addEventListener("click", event => {
    if (event.target === tocDialog) tocDialog.close();
  });

  const PROGRESS_KEY = "velune-reading-progress-v1:";
  // Reading state is kept per chapter on this device. No private data is sent
  // to the site, and simply opening a chapter does not count as reading.
  if (document.body.dataset.episode === "true") {
    const title = document.querySelector(".prose h1")?.textContent || document.title;
    const path = location.pathname;
    const positionKey = "velune-reader-scroll:" + path;
    const progressKey = PROGRESS_KEY + path;
    const previous = Number(read(positionKey, 0));
    let storedProgress = read(progressKey, null);
    const previouslyFinished = !!(storedProgress && storedProgress.finished);
    if (Number.isFinite(previous) && previous > 0) {
      requestAnimationFrame(() => scrollTo({top: previous, behavior: "instant"}));
    }
    let pending = false;
    const updateProgress = () => {
      if (openOverlays > 0) { pending = false; return; }
      const denominator = document.documentElement.scrollHeight - innerHeight;
      const fraction = denominator > 0 ? Math.min(1, Math.max(0, scrollY / denominator)) : 1;
      const progressTrack = el("progress-track");
      if (progressTrack) progressTrack.style.width = (fraction * 100).toFixed(2) + "%";
      save(positionKey, Math.round(scrollY));
      if (scrollY >= 140) {
        save(LAST, {path, title});
        const percent = Math.round(fraction * 100);
        const finished = previouslyFinished || !!storedProgress?.finished || fraction >= 0.94;
        const highest = Math.max(1, percent, Number(storedProgress?.percent) || 0);
        storedProgress = {percent: highest, finished};
        save(progressKey, storedProgress);
      }
      pending = false;
    };
    window.addEventListener("scroll", () => {
      if (!pending) { pending = true; requestAnimationFrame(updateProgress); }
    }, {passive: true});
    window.addEventListener("resize", updateProgress, {passive: true});
    updateProgress();
  } else {
    const continuation = el("continue-reading");
    const entries = [...document.querySelectorAll(".work-episodes a")];
    const episodePaths = entries.map(a => new URL(a.href, location.href).pathname);

    function renderWorkReadingStatus() {
      const last = read(LAST, null);
      let finishedCount = 0, startedCount = 0;
      for (let i = 0; i < entries.length; i++) {
        const a = entries[i];
        const chapterPath = episodePaths[i];
        const progress = read(PROGRESS_KEY + chapterPath, null);
        const legacyScroll = Number(read("velune-reader-scroll:" + chapterPath, 0));
        const finished = !!(progress && progress.finished);
        const percent = progress && Number.isFinite(Number(progress.percent))
          ? Math.min(100, Math.max(0, Math.round(Number(progress.percent)))) : 0;
        const started = finished || percent > 0 || legacyScroll >= 140;
        const badge = a.querySelector(".episode-status");
        if (finished) {
          finishedCount++;
          a.closest("li")?.setAttribute("data-reading-state", "finished");
          if (badge) badge.textContent = "読了";
        } else if (started) {
          startedCount++;
          a.closest("li")?.setAttribute("data-reading-state", "in-progress");
          if (badge) badge.textContent = percent ? "読書中 " + percent + "%" : "読書中";
        } else {
          a.closest("li")?.setAttribute("data-reading-state", "unread");
          if (badge) badge.textContent = "未読";
        }
      }
      const total = entries.length;
      if (el("completed-count")) el("completed-count").textContent =
        finishedCount + " / " + total + "話 読了";
      const meter = document.querySelector(".work-progress-track");
      if (meter) meter.setAttribute("aria-valuenow", String(finishedCount));
      if (el("work-progress-bar")) el("work-progress-bar").style.width =
        (total ? finishedCount / total * 100 : 0).toFixed(1) + "%";
      if (el("reading-summary")) {
        el("reading-summary").textContent = startedCount
          ? startedCount + "話を読書中 · " + finishedCount + "話を読了"
          : finishedCount ? finishedCount + "話を読了しました" : "まだ読んだ話がありません。";
      }
      if (continuation) {
        continuation.hidden = true;
        continuation.removeAttribute("href");
        if (last && typeof last.path === "string") {
          const index = episodePaths.indexOf(last.path);
          if (index >= 0) {
            const previousProgress = read(PROGRESS_KEY + last.path, null);
            const target = previousProgress?.finished ? entries[index + 1] : entries[index];
            if (target) {
              continuation.href = target.href;
              continuation.textContent = previousProgress?.finished
                ? "次の話から読む →" : "続きから読む →";
              continuation.hidden = false;
            }
          }
        }
      }
    }

    // Scope destructive changes to exact episode URLs in this work.
    // Reader preferences, caches and histories of other works are untouched.
    function resetWorkReadingStatus() {
      try {
        for (const path of episodePaths) {
          localStorage.removeItem(PROGRESS_KEY + path);
          localStorage.removeItem("velune-reader-scroll:" + path);
        }
        for (const key of [LAST, "velune-reader-last"]) {
          const last = read(key, null);
          if (last && typeof last.path === "string" && episodePaths.includes(last.path)) {
            localStorage.removeItem(key);
          }
        }
        return true;
      } catch {
        return false;
      }
    }

    renderWorkReadingStatus();
    const resetDialog = el("reset-reading-dialog");
    const errorMessage = el("reset-reading-error");
    resetDialog?.addEventListener("close", releaseReaderScroll);
    el("reset-reading")?.addEventListener("click", () => {
      if (errorMessage) errorMessage.hidden = true;
      openReaderOverlay(resetDialog);
      el("cancel-reset-reading")?.focus();
    });
    el("cancel-reset-reading")?.addEventListener("click", () => resetDialog?.close());
    resetDialog?.addEventListener("click", event => {
      if (event.target === resetDialog) resetDialog.close();
    });
    el("confirm-reset-reading")?.addEventListener("click", () => {
      if (!resetWorkReadingStatus()) {
        if (errorMessage) {
          errorMessage.textContent = "読書記録を消去できませんでした。ブラウザの保存設定をご確認ください。";
          errorMessage.hidden = false;
        }
        return;
      }
      resetDialog?.close();
      renderWorkReadingStatus();
    });
  }

  const state = el("offline-state");
  const EPISODE_CACHE = "velune-episodes-v1";
  const inEpisode = document.body.dataset.episode === "true";
  let offlineReady = false;
  let currentSaved = false;
  const showNetwork = () => {
    if (!state) return;
    const offline = !navigator.onLine;
    if (inEpisode && currentSaved) state.textContent = offline ? "オフライン · 保存済み" : "この話を保存済み";
    else state.textContent = offline ? "オフライン" : offlineReady ? "オフライン対応" : "";
  };
  window.addEventListener("online", showNetwork);
  window.addEventListener("offline", showNetwork);
  showNetwork();

  async function saveCurrentEpisode() {
    if (!inEpisode || !("caches" in window)) return;
    const cache = await caches.open(EPISODE_CACHE);
    const url = location.origin + location.pathname;
    const existing = await cache.match(url);
    if (existing) { currentSaved = true; showNetwork(); return; }
    if (!navigator.onLine) return;
    try {
      // Initial navigation can precede SW activation. Save the HTML explicitly.
      const response = await fetch(url, {cache: "reload"});
      if (response.ok) {
        await cache.put(url, response.clone());
        currentSaved = true;
        showNetwork();
      }
    } catch {
      if (!existing && state) state.textContent = "オフライン保存に失敗";
    }
  }

  async function savedEpisodeCount(links, cache) {
    let total = 0;
    for (const url of links) if (await cache.match(url)) total++;
    return total;
  }

  async function setupFullDownload() {
    const button = el("save-all");
    const progress = el("offline-progress");
    if (!button || !progress || !("caches" in window)) return;
    const links = [...document.querySelectorAll(".toc a")].map(a => a.href);
    const cache = await caches.open(EPISODE_CACHE);
    const report = async message => {
      const count = await savedEpisodeCount(links, cache);
      progress.textContent = (message || "保存済み") + "：" + count + " / " + links.length + "話";
      return count;
    };
    await report("保存済み");
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "保存中…";
      let failed = 0;
      // Limit parallel requests, avoiding unnecessary mobile network pressure.
      for (let start = 0; start < links.length; start += 3) {
        const batch = links.slice(start, start + 3);
        await Promise.all(batch.map(async url => {
          try {
            if (await cache.match(url)) return;
            const response = await fetch(url, {cache: "reload"});
            if (!response.ok) throw new Error("HTTP " + response.status);
            await cache.put(url, response.clone());
          } catch { failed++; }
        }));
        await report("保存中");
      }
      await report(failed ? "一部保存できませんでした（再試行できます）" : "オフライン保存完了");
      button.textContent = failed ? "残りを保存" : "保存済み";
      button.disabled = failed === 0;
    });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    const root = document.querySelector('meta[name="app-root"]').content;
    navigator.serviceWorker.register(new URL(root + "sw.js", location.href))
      .then(() => navigator.serviceWorker.ready)
      .then(async () => {
        offlineReady = true;
        showNetwork();
        await saveCurrentEpisode();
        await setupFullDownload();
      })
      .catch(() => { if (state) state.textContent = navigator.onLine ? "オフライン設定に失敗" : "オフライン"; });
  }
})();
