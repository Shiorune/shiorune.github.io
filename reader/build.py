#!/usr/bin/env python3
"""Build a public, prose-only GitHub Pages PWA; no INDEX or other sources are copied."""
from __future__ import annotations
import hashlib
import html
import json
import re
import shutil
from pathlib import Path
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_source" / "works"
DEST = ROOT / "dist"
EPISODE_FILE = re.compile(r"^第([0-9]+)話\.md$")
HEADLINE = re.compile(r"^# +([^\n]+)\s*$", flags=re.MULTILINE)
TITLE = "Shiorune"
MARKDOWN = MarkdownIt("commonmark", {"html": False, "linkify": False}).enable("table").enable("strikethrough")



# An opening ">>123" in a forum excerpt is a literal reply reference.
# CommonMark otherwise parses it as nested block quotes and hides both ">".
# Keep Markdown parsing enabled for genuine "> " quotes, headings and links.
# Do not alter characters in fenced/indented code blocks.
BBS_REFERENCE = re.compile(r"^([ \t]{0,3})(>>)(?=[0-9])")
FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def preserve_forum_reply_markers(source: str) -> str:
    lines = []
    fence_char = ""
    fence_length = 0
    for line in source.splitlines(keepends=True):
        content = line.rstrip("\r\n")
        if fence_char:
            closing = re.fullmatch(
                r" {0,3}" + re.escape(fence_char) +
                "{" + str(fence_length) + r",}[ \t]*", content
            )
            if closing:
                fence_char = ""
            lines.append(line)
            continue
        fence = FENCE_OPEN.match(content)
        if fence:
            fence_char = fence.group(1)[0]
            fence_length = len(fence.group(1))
            lines.append(line)
            continue
        match = BBS_REFERENCE.match(line)
        if match:
            # Only numeric forum references are escaped; real nested quotes stay Markdown.\n            # Backslash escapes the quote markers, while Markdown still handles
            # two trailing spaces (hard breaks) and all non-forum markup.
            line = (match.group(1) + "\\>" * len(match.group(2)) +
                    line[match.end():])
        lines.append(line)
    return "".join(lines)


def episode_data(path: Path) -> dict:
    number = int(EPISODE_FILE.fullmatch(path.name).group(1))
    source = path.read_text(encoding="utf-8-sig")
    # Ignore metadata even if its fields change. Publish only from first H1 downward.
    if source.startswith("---\n"):
        end = re.search(r"^---\s*$", source[4:], flags=re.MULTILINE)
        if end is None:
            raise ValueError(f"Unclosed YAML frontmatter: {path}")
        source = source[4 + end.end():]
    heading = HEADLINE.search(source)
    if heading is None:
        raise ValueError(f"No level-1 story title: {path}")
    body = source[heading.start():].strip()
    heading_text = heading.group(1).strip()
    # Preserve Japanese full-width first-line indentation through CommonMark.
    body = re.sub(r"(?m)^(\u3000+)", lambda m: "&#x3000;" * len(m.group(1)), body)
    body = preserve_forum_reply_markers(body)
    return {"number": number, "name": heading_text,
            "html": MARKDOWN.render(body), "slug": str(number).zfill(3)}


def document(title: str, body: str, *, asset_prefix: str, is_episode: bool, toc_items: str = "", work_title: str = "") -> str:
    settings = '''<dialog id="settings" aria-labelledby="settings-title">
      <div class="settings-shell">
        <header class="settings-head">
          <div><p class="settings-eyebrow">READING PREFERENCES</p><h2 id="settings-title">表示設定</h2></div>
          <button id="close-settings" type="button" class="icon-btn" aria-label="設定を閉じる">×</button>
        </header>
        <div class="settings-tabs" role="tablist" aria-label="表示設定の項目">
          <button type="button" id="tab-reading" role="tab" data-settings-tab="reading" aria-selected="true" aria-controls="panel-reading" tabindex="0">読み心地</button>
          <button type="button" id="tab-font" role="tab" data-settings-tab="font" aria-selected="false" aria-controls="panel-font" tabindex="-1">書体</button>
          <button type="button" id="tab-theme" role="tab" data-settings-tab="theme" aria-selected="false" aria-controls="panel-theme" tabindex="-1">背景</button>
        </div>
        <div class="settings-scroll settings-panel" id="settings-scroll">
          <section class="settings-tab-panel" id="panel-reading" role="tabpanel" aria-labelledby="tab-reading">
            <p class="settings-section-intro">まずは読みやすさを選び、必要なら微調整できます。</p>
<fieldset class="reading-presets"><legend>読み心地</legend><div class="preset-choice">
          <button type="button" data-reading-preset="compact">すっきり<small>15px · 行間1.6</small></button>
          <button type="button" data-reading-preset="standard">標準<small>17px · 行間1.8</small></button>
          <button type="button" data-reading-preset="relaxed">ゆったり<small>19px · 行間2.0</small></button>
        </div></fieldset>
<label class="setting-range">文字サイズ <output id="font-value">17px</output><input id="font-size" type="range" min="14" max="28" value="17" step="1"></label>
        <label class="setting-range">行間 <output id="line-value">1.8</output><input id="line-height" type="range" min="1.4" max="2.6" value="1.8" step="0.1"></label>


<div class="settings-preview" aria-label="本文プレビュー"><span>プレビュー</span><p>　物語は、ここから始まる。</p><p>　お気に入りの文字と色で、続きを読もう。</p></div>
          </section>
          <section class="settings-tab-panel" id="panel-font" role="tabpanel" aria-labelledby="tab-font" hidden>
            <p class="settings-section-intro">好きな書体を選択してください。端末にない書体は代替表示されます。</p>
<fieldset><legend>フォント</legend><div class="font-choice">
          <label class="font-card" data-font="serif"><input name="font" type="radio" value="serif"><span class="font-name">標準の明朝</span><span class="font-sample demo-serif">あいうえお 漢字</span></label>
          <label class="font-card" data-font="yu-mincho"><input name="font" type="radio" value="yu-mincho"><span class="font-name">游明朝</span><span class="font-sample demo-yumincho">あいうえお 漢字</span></label>
          <label class="font-card" data-font="hiragino-mincho"><input name="font" type="radio" value="hiragino-mincho"><span class="font-name">ヒラギノ明朝</span><span class="font-sample demo-hiraginomincho">あいうえお 漢字</span></label>
          <label class="font-card" data-font="sans"><input name="font" type="radio" value="sans"><span class="font-name">標準のゴシック</span><span class="font-sample demo-sans">あいうえお 漢字</span></label>
          <label class="font-card" data-font="meiryo"><input name="font" type="radio" value="meiryo"><span class="font-name">Meiryo UI</span><span class="font-sample demo-meiryo">あいうえお 漢字</span></label>
          <label class="font-card" data-font="yu-gothic"><input name="font" type="radio" value="yu-gothic"><span class="font-name">游ゴシック</span><span class="font-sample demo-yugothic">あいうえお 漢字</span></label>
          <label class="font-card" data-font="rounded"><input name="font" type="radio" value="rounded"><span class="font-name">丸ゴシック</span><span class="font-sample demo-rounded">あいうえお 漢字</span></label>
          <label class="font-card" data-font="mono"><input name="font" type="radio" value="mono"><span class="font-name">等幅</span><span class="font-sample demo-mono">あいうえお 漢字</span></label>
        </div><p class="settings-hint">端末にないフォントは近い書体で表示されます。</p></fieldset>
          </section>
          <section class="settings-tab-panel" id="panel-theme" role="tabpanel" aria-labelledby="tab-theme" hidden>
            <p class="settings-section-intro">背景を選択すると、その場で読書画面に反映されます。</p>
<fieldset><legend>背景カラーパレット</legend><div class="color-choice">
          <label><input name="theme" type="radio" value="paper"><span class="color-swatch" style="--swatch:#f4edde"></span><span>生成り</span></label>
          <label><input name="theme" type="radio" value="light"><span class="color-swatch" style="--swatch:#ffffff"></span><span>白</span></label>
          <label><input name="theme" type="radio" value="ivory"><span class="color-swatch" style="--swatch:#fff8e7"></span><span>象牙</span></label>
          <label><input name="theme" type="radio" value="sand"><span class="color-swatch" style="--swatch:#eddfc7"></span><span>砂色</span></label>
          <label><input name="theme" type="radio" value="rose"><span class="color-swatch" style="--swatch:#f9e6eb"></span><span>薄桜</span></label>
          <label><input name="theme" type="radio" value="peach"><span class="color-swatch" style="--swatch:#fae1d5"></span><span>桃色</span></label>
          <label><input name="theme" type="radio" value="lavender"><span class="color-swatch" style="--swatch:#eae4f5"></span><span>藤色</span></label>
          <label><input name="theme" type="radio" value="sky"><span class="color-swatch" style="--swatch:#dceef5"></span><span>空色</span></label>
          <label><input name="theme" type="radio" value="mint"><span class="color-swatch" style="--swatch:#e0f4e9"></span><span>薄荷</span></label>
          <label><input name="theme" type="radio" value="sage"><span class="color-swatch" style="--swatch:#e7edda"></span><span>若草</span></label>
          <label><input name="theme" type="radio" value="slate"><span class="color-swatch" style="--swatch:#dce3ea"></span><span>灰青</span></label>
          <label><input name="theme" type="radio" value="dark"><span class="color-swatch" style="--swatch:#2c3036"></span><span>墨色</span></label>
          <label><input name="theme" type="radio" value="night"><span class="color-swatch" style="--swatch:#171b22"></span><span>夜</span></label>
          <label><input name="theme" type="radio" value="sepia"><span class="color-swatch" style="--swatch:#423a31"></span><span>焦茶</span></label>
          <label class="custom-theme"><input name="theme" type="radio" value="custom"><span class="custom-picker"><input type="color" id="custom-color" value="#f4edde" aria-label="好きな背景色を選択"></span><span>自由色</span></label>
        </div></fieldset>
          </section>
        </div>
        <footer class="settings-footer">
          <button id="reset-settings" class="reset-btn" type="button">初期値に戻す</button>
          <button id="done-settings" class="settings-done" type="button">読書に戻る</button>
        </footer>
      </div></dialog>'''
    toc_button = ('<a id="open-toc" class="toc-trigger" href="../index.html"'
                  ' aria-haspopup="dialog" aria-controls="chapter-list">☰ <span>目次</span></a>'
                  if is_episode else "")
    toc_dialog = (f'<dialog id="chapter-list" aria-label="作品の目次">'
                  f'<div class="toc-panel"><div class="toc-panel-head">'
                  f'<div><p class="settings-eyebrow">CHAPTERS</p><h2>{html.escape(work_title)}</h2></div>'
                  '<button id="close-toc" type="button" class="icon-btn" aria-label="目次を閉じる">×</button></div>'
                  f'<ol class="toc drawer-toc">{toc_items}</ol>'
                  '<p class="toc-panel-back"><a href="../index.html">作品の目次ページへ</a></p></div></dialog>'
                  if is_episode else "")
    return f'''<!doctype html>
<html lang="ja" data-theme="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f4edde"><meta name="app-root" content="{asset_prefix}"><meta name="description" content="Shiorune 小説リーダー">
<link rel="manifest" href="{asset_prefix}manifest.webmanifest"><link rel="icon" href="{asset_prefix}icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{asset_prefix}assets/reader.css"><title>{html.escape(title)} - {TITLE}</title></head>
<body data-episode="{'true' if is_episode else 'false'}">
<header class="topbar"><a class="brand" href="{asset_prefix}index.html" aria-label="Shiorune 作品一覧へ"><img src="{asset_prefix}icon.svg" alt="" aria-hidden="true" width="28" height="28"><span>Shiorune</span></a><div class="topbar-controls"><span class="offline-state" id="offline-state" aria-live="polite"></span>{toc_button}<button id="open-settings" type="button" class="icon-btn" aria-label="表示設定">Aa</button></div></header>
<main class="reading-area">{body}</main>
{toc_dialog}
{settings}<div class="progress-track" id="progress-track" aria-hidden="true"></div>
<script defer src="{asset_prefix}assets/reader.js"></script></body></html>'''


WORK_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")


def collect_works() -> list[dict]:
    if not SOURCE.is_dir():
        raise SystemExit(f"Missing works directory: {SOURCE}")
    works = []
    for folder in sorted(SOURCE.iterdir()):
        # The template and all underscore-prefixed directories are never published.
        if not folder.is_dir() or folder.name.startswith(("_", ".")):
            continue
        manifest = folder / "work.json"
        if not manifest.is_file():
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("published") is not True:
            continue
        work_id = data.get("id")
        title = data.get("title")
        if (not isinstance(work_id, str) or not WORK_ID.fullmatch(work_id)
                or work_id != folder.name):
            raise ValueError(f"Invalid published work id in {manifest}")
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"Missing title in {manifest}")
        description = data.get("description", "")
        if not isinstance(description, str) or len(description) > 2000:
            raise ValueError(f"Invalid description in {manifest}")
        description = description.strip()
        prose = folder / "story" / "prose"
        if not prose.is_dir():
            raise ValueError(f"Missing story/prose directory: {folder}")
        episodes = [episode_data(path) for path in prose.iterdir()
                    if path.is_file() and EPISODE_FILE.fullmatch(path.name)]
        episodes.sort(key=lambda episode: episode["number"])
        if len({ep["number"] for ep in episodes}) != len(episodes):
            raise ValueError(f"Duplicate episode numbers in {folder}")
        if not episodes:
            raise ValueError(f"Published work has no prose episodes: {folder}")
        works.append({"id": work_id, "title": title.strip(),
                      "description": description, "episodes": episodes})
    if not works:
        raise SystemExit("No published work found under _source/works")
    return works


def build() -> None:
    works = collect_works()
    if DEST.exists():
        shutil.rmtree(DEST)
    (DEST / "assets").mkdir(parents=True)
    (DEST / "works").mkdir()
    for name in ("reader.css", "reader.js"):
        shutil.copyfile(ROOT / "reader" / name, DEST / "assets" / name)
    shutil.copyfile(ROOT / "reader" / "icon.svg", DEST / "icon.svg")
    manifest = {
        "name": "Shiorune", "short_name": "Shiorune", "lang": "ja",
        "start_url": "./index.html", "scope": "./", "display": "standalone",
        "background_color": "#f4edde", "theme_color": "#4d483d",
        "icons": [{"src": "./icon.svg", "sizes": "any",
                   "type": "image/svg+xml", "purpose": "any maskable"}]
    }
    (DEST / "manifest.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    chapter_paths = []
    toc_paths = []
    library_items = []
    total_episodes = 0
    for work in works:
        work_id = work["id"]
        episodes = work["episodes"]
        title = work["title"]
        description = work["description"]
        book_dir = DEST / "works" / work_id
        (book_dir / "episodes").mkdir(parents=True)
        for ep in episodes:
            toc_items = "\n".join(
                '<li><a href="' + entry["slug"] + '.html"' +
                (' aria-current="page"' if entry["slug"] == ep["slug"] else '') +
                '>' + html.escape(entry["name"]) + '</a></li>'
                for entry in episodes)
            body = f'<article class="prose">{ep["html"]}</article>'
            page = document(ep["name"], body, asset_prefix="../../../",
                            is_episode=True, toc_items=toc_items, work_title=title)
            dest = book_dir / "episodes" / f'{ep["slug"]}.html'
            dest.write_text(page, encoding="utf-8")
            chapter_paths.append("./" + dest.relative_to(DEST).as_posix())
        links = "\n".join(
            '<li><a href="./episodes/' + ep["slug"] + '.html">'
            '<span class="episode-title">' + html.escape(ep["name"]) + '</span>'
            '<span class="episode-status" aria-label="読書状況">未読</span>'
            '</a></li>'
            for ep in episodes)
        # Native details lets visitors expand long descriptions without JavaScript.
        if description and len(description) > 160:
            excerpt = html.escape(description[:156].rstrip() + "…")
            overview = (
                '<section class="work-synopsis" aria-labelledby="work-overview-title">'
                '<h2 id="work-overview-title">あらすじ</h2>'
                '<details class="synopsis-expander"><summary>'
                f'<span class="synopsis-excerpt">{excerpt}</span>'
                '<span class="synopsis-toggle">すべて表示 ↓</span></summary>'
                f'<p class="synopsis-full">{html.escape(description)}</p>'
                '</details></section>'
            )
        elif description:
            overview = (
                '<section class="work-synopsis" aria-labelledby="work-overview-title">'
                '<h2 id="work-overview-title">あらすじ</h2>'
                f'<p>{html.escape(description)}</p></section>'
            )
        else:
            overview = ""
        first_href = './episodes/' + episodes[0]["slug"] + '.html'
        hero = (
            '<section class="work-hero" aria-label="作品情報">'
            '<div class="work-hero-main">' +
            '<div class="work-hero-info"><p class="work-category">WEB NOVEL</p>'
            f'<h1>{html.escape(title)}</h1>'
            f'<div class="work-meta"><span>全{len(episodes)}話</span>'
            '</div></div></div>'
            '<div class="work-action-row">'
            f'<a class="start-reading" href="{first_href}">第1話から読む <span aria-hidden="true">→</span></a>'
            '<a class="continue" id="continue-reading" hidden>続きを読む <span aria-hidden="true">→</span></a>'
            '<a class="open-episode-list" href="#episode-list-title">エピソード一覧を見る ↓</a>'
            '</div></section>'
        )
        home = (
            '<div class="work-detail"><nav class="work-breadcrumb" aria-label="パンくずリスト">'
            '<a href="../../index.html">作品一覧</a><span aria-hidden="true"> / </span>'
            f'<span aria-current="page">{html.escape(title)}</span></nav>'
            + hero + overview +
            '<section class="work-progress" aria-label="読書の進捗">'
            '<div class="work-progress-heading"><strong>読書の進捗</strong>'
            f'<span id="completed-count">0 / {len(episodes)}話 読了</span></div>'
            '<div class="work-progress-track" role="progressbar" aria-label="読了した話数"'
            f' aria-valuemin="0" aria-valuemax="{len(episodes)}" aria-valuenow="0">'
            '<span id="work-progress-bar"></span></div>'
            '<p id="reading-summary">まだ読んだ話がありません。</p>'
            '<div class="work-progress-actions">'
            '<button type="button" id="reset-reading" aria-haspopup="dialog"'
            ' aria-controls="reset-reading-dialog">読書状況をリセット</button></div>'
            '</section>'
            '<dialog id="reset-reading-dialog" aria-labelledby="reset-reading-title"'
            ' aria-describedby="reset-reading-message">'
            '<div class="reset-reading-panel"><h2 id="reset-reading-title">読書状況をリセット</h2>'
            '<p id="reset-reading-message">この作品の読書位置・読書中・読了の記録をすべて消去します。'
            '文字・背景の設定、他の作品の記録、オフライン保存はそのまま残ります。</p>'
            '<p class="reset-reading-error" id="reset-reading-error" role="alert" hidden></p>'
            '<div class="reset-reading-buttons">'
            '<button type="button" id="cancel-reset-reading">キャンセル</button>'
            '<button type="button" id="confirm-reset-reading">記録を消去</button>'
            '</div></div></dialog>'
            '<section class="work-episodes-section" aria-labelledby="episode-list-title">'
            f'<div class="work-episode-heading"><div><p>EPISODES</p><h2 id="episode-list-title">エピソード一覧</h2></div>'
            f'<span>{len(episodes)}話</span></div>'
            '<details class="offline-tools"><summary>オフライン保存'
            '<span aria-hidden="true" class="offline-chevron">⌄</span></summary>'
            '<div class="offline-detail"><p>この作品をまとめて端末に保存できます。</p>'
            '<button type="button" id="save-all">全話を保存</button>'
            '<p class="offline-progress" id="offline-progress" aria-live="polite">'
            '保存状況を確認しています</p></div></details>'
            f'<ol class="toc work-episodes">{links}</ol>'
            '</section></div>'
        )
        (book_dir / "index.html").write_text(
            document(title, home, asset_prefix="../../", is_episode=False), encoding="utf-8")
        toc_paths.append(f"./works/{work_id}/index.html")
        teaser = html.escape(description[:85] + ("…" if len(description) > 85 else ""))
        library_items.append(
            '<li class="work-item"><a class="work-card" href="./works/' + work_id + '/index.html">'
            
            '<span class="work-card-details"><strong class="work-card-title">' + html.escape(title) + '</strong>'
            '<span class="work-card-teaser">' + teaser + '</span>'
            '<span class="work-card-count">全' + str(len(episodes)) + '話</span></span>'
            '<span class="work-card-arrow" aria-hidden="true">›</span>'
            '</a></li>')
        total_episodes += len(episodes)

    library = (f'<section class="home shiorune-library">'
               '<div class="library-intro"><p class="eyebrow">SHIORUNE</p>'
               '<h1>Shiorune</h1></div>'
               f'<div class="library-heading"><h2>作品一覧</h2><span>{len(works)}作品</span></div>'
               '<ul class="work-list">' + "".join(library_items) + '</ul></section>')
    (DEST / "index.html").write_text(
        document("作品一覧", library, asset_prefix="./", is_episode=False), encoding="utf-8")

    # All public files are explicitly generated. Raw Markdown and indexes stay private.
    shell_urls = ["./", "./index.html", "./assets/reader.css",
                  "./assets/reader.js", "./manifest.webmanifest", "./icon.svg", *toc_paths]
    episode_urls = chapter_paths
    digest = hashlib.sha256(
        "".join(p.read_text(encoding="utf-8") for p in sorted(DEST.rglob("*")) if p.is_file()).encode()
    ).hexdigest()[:16]
    sw = r'''const SHELL = "velune-shell-__BUILD__";
const EPISODES = "velune-episodes-v1";
const SHELL_FILES = __SHELL_FILES__;
const EPISODE_FILES = __EPISODE_FILES__;
const scope = self.registration.scope;
const allowed = new Set(EPISODE_FILES.map(path => new URL(path, scope).pathname));
const offlinePage = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未保存の話</title><body style="font:18px/1.8 system-ui;padding:24px"><h1>この話は保存されていません</h1><p>オンラインで一度開くか、目次の「全話を保存」を利用してください。</p><p><a href="../index.html">目次に戻る</a></p></body></html>';

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL)
    .then(cache => cache.addAll(SHELL_FILES.map(path => new URL(path, scope))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name =>
      (name.startsWith("velune-shell-") && name !== SHELL) ||
      name.startsWith("velune-reader-")).map(name => caches.delete(name)));
    const chapters = await caches.open(EPISODES);
    for (const request of await chapters.keys()) {
      if (!allowed.has(new URL(request.url).pathname)) await chapters.delete(request);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  if (allowed.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(EPISODES);
      const cached = await cache.match(req, {ignoreSearch: true});
      const update = fetch(req).then(async response => {
        if (response.ok) await cache.put(req, response.clone()).catch(() => {});
        else if (response.status === 404 || response.status === 410) await cache.delete(req);
        return response;
      });
      // Online users always receive the latest chapter/TOC; cache remains for offline use.
      try { return await update; }
      catch {
        return cached || new Response(offlinePage, {status: 503, headers: {"Content-Type": "text/html; charset=utf-8"}});
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(req, {ignoreSearch: true});
    const root = new URL(scope);
    // Network-first for the shell too: prevent first visits from seeing stale menus.
    try {
      const fresh = await fetch(req);
      if (fresh.ok && (cached || SHELL_FILES.some(path => new URL(path, scope).pathname === url.pathname))) {
        await cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      if (cached) return cached;
      if (url.pathname === root.pathname && req.mode === "navigate") {
        const index = await cache.match(new URL("./index.html", scope));
        if (index) return index;
      }
      return Response.error();
    }
  })());
});
'''
    sw = (sw.replace("__BUILD__", digest)
          .replace("__SHELL_FILES__", json.dumps(shell_urls, ensure_ascii=False))
          .replace("__EPISODE_FILES__", json.dumps(episode_urls, ensure_ascii=False)))
    (DEST / "sw.js").write_text(sw, encoding="utf8")
    print(f"Built {len(works)} work(s), {total_episodes} episode(s)")
    if any(path.name.casefold() == "index.md" or path.suffix == ".md"
           for path in DEST.rglob("*") if path.is_file()):
        raise AssertionError("Raw Markdown or INDEX.md in publication output")


if __name__ == "__main__":
    build()
