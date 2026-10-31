"""Regression tests: multi-work discovery and strict publication allowlist."""
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

script = Path(__file__).resolve().parent / "build.py"
spec = importlib.util.spec_from_file_location("velune_build", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fixture(root: Path, name: str, title: str, *, published: bool = True,
            description: str = "") -> Path:
    folder = root / name
    prose = folder / "story" / "prose"
    prose.mkdir(parents=True)
    (folder / "work.json").write_text(
        json.dumps({"id": name, "title": title, "published": published, "description": description}, ensure_ascii=False),
        encoding="utf-8")
    (folder / "canon").mkdir()
    (folder / "canon" / "SECRET.md").write_text("SECRET-CANON-MARKER", encoding="utf-8")
    (prose / "INDEX.md").write_text("SECRET-INDEX-MARKER", encoding="utf-8")
    return prose


def check_build(source: Path, dest: Path, chapters: dict[str, list[str]]) -> None:
    mod.SOURCE = source
    mod.DEST = dest
    mod.build()
    root_html = (dest / "index.html").read_text(encoding="utf-8")
    assert "Shiorune" in root_html
    assert "Velune" not in root_html
    assert "読む、見つかる、好きがふえる。" not in root_html
    assert 'aria-label="Shiorune 作品一覧へ"' in root_html
    for work_id, names in chapters.items():
        ep_folder = dest / "works" / work_id / "episodes"
        assert ep_folder.is_dir()
        assert sorted(p.name for p in ep_folder.glob("*.html")) == sorted(names)
        assert (dest / "works" / work_id / "index.html").exists()
    assert not (dest / "works" / "_template").exists()
    assert not (dest / "works" / "draft").exists()
    assert not (dest / "canon").exists()
    for path in dest.rglob("*"):
        if path.is_file():
            assert path.suffix != ".md"
            content = path.read_text(encoding="utf-8")
            for secret in ("SECRET-INDEX-MARKER", "SECRET-CANON-MARKER",
                           "status: PENDING", "story_adopted:", "source_plot:"):
                assert secret not in content, (secret, path)
    sw = (dest / "sw.js").read_text(encoding="utf-8")
    for work_id, names in chapters.items():
        for name in names:
            assert f"works/{work_id}/episodes/{name}" in sw
    assert "_template" not in sw
    assert "toc-filter" not in (dest / "assets" / "reader.js").read_text(encoding="utf-8")
    assert "chapter-filter" not in (dest / "assets" / "reader.js").read_text(encoding="utf-8")
    assert "SECRET" not in root_html
    # Reader UX contract: use a chapter drawer rather than a sticky footer.
    ep_html = (dest / "works" / "revalna" / "episodes" /
               chapters["revalna"][0]).read_text(encoding="utf-8")
    assert 'id="chapter-list"' in ep_html
    assert 'id="open-toc"' in ep_html
    assert 'id="chapter-filter"' not in ep_html
    assert '話数・タイトルで検索' not in ep_html
    assert 'href="../index.html"' in ep_html
    assert 'class="toc-trigger"' in ep_html
    assert 'aria-current="page"' in ep_html
    assert '<nav class="chapter-nav"' not in ep_html
    home_html = (dest / "works" / "revalna" / "index.html").read_text(encoding="utf-8")
    assert '<details class="offline-tools">' in home_html
    assert 'class="work-hero"' in home_html
    assert 'class="start-reading"' in home_html
    assert 'class="work-progress-track"' in home_html
    assert 'id="completed-count"' in home_html
    # Reset must be explicit, confirmed and scoped to this novel.
    assert 'id="reset-reading"' in home_html
    assert 'id="reset-reading-dialog"' in home_html
    assert 'id="confirm-reset-reading"' in home_html
    assert 'id="cancel-reset-reading"' in home_html
    assert '文字・背景の設定、他の作品の記録、オフライン保存はそのまま残ります。' in home_html
    assert 'class="episode-status" aria-label="読書状況"' in home_html
    assert 'class="toc work-episodes"' in home_html
    assert '<section class="offline-library"' not in home_html
    assert 'id="continue-reading" hidden' in home_html
    assert '<img src="../../icon.svg"' in home_html
    assert (dest / "icon.svg").exists()
    assert "Shiorune" in (dest / "icon.svg").read_text(encoding="utf-8")
    assert "読む、見つかる、好きがふえる。" not in (dest / "icon.svg").read_text(encoding="utf-8")
    assert 'id="chapter-list"' not in home_html
    assert 'id="toc-filter"' not in home_html
    assert 'class="open-episode-list"' in home_html
    assert '<div class="work-cover"' not in home_html
    assert 'class="work-card-cover"' not in home_html
    assert 'placeholder="話数・タイトルで探す"' not in home_html
    # Description is explicitly public metadata, not canonical source docs.
    assert '<section class="work-synopsis"' in home_html
    assert 'あらすじ' in home_html
    assert 'class="synopsis-expander"' in home_html
    assert 'すべて表示' in home_html
    assert 'class="synopsis-full"' in home_html
    assert '&lt;script&gt;' in home_html  # HTML-escaped user-supplied description
    assert '<script>private</script>' not in home_html
    # Settings should stay reachable even on short phone viewports.
    assert '<div class="settings-shell">' in ep_html
    assert 'id="settings-scroll"' in ep_html
    assert 'role="tablist"' in ep_html
    for panel in ("reading", "font", "theme"):
        assert f'id="tab-{panel}" role="tab"' in ep_html
        assert f'id="panel-{panel}" role="tabpanel"' in ep_html
    assert 'id="panel-font" role="tabpanel" aria-labelledby="tab-font" hidden' in ep_html
    assert 'id="panel-theme" role="tabpanel" aria-labelledby="tab-theme" hidden' in ep_html
    assert 'id="done-settings"' in ep_html
    assert 'id="close-settings"' in ep_html
    assert 'data-reading-preset="standard"' in ep_html
    assert 'id="font-size" type="range" min="14" max="28" value="17"' in ep_html
    assert 'id="line-height" type="range" min="1.4" max="2.6" value="1.8"' in ep_html
    assert 'id="reader-width"' not in ep_html
    assert '本文の幅' not in ep_html
    css = (dest / "assets" / "reader.css").read_text(encoding="utf-8")
    assert "[hidden]{display:none!important}" in css
    assert ".settings-shell{display:flex;flex-direction:column" in css
    assert ".settings-shell>.settings-scroll.settings-panel{flex:1 1 auto;min-height:0" in css
    assert ".settings-footer{flex:0 0 auto" in css
    script = (dest / "assets" / "reader.js").read_text(encoding="utf-8")
    assert "velune-reader-last-v2" in script
    assert 'const PROGRESS_KEY = "velune-reading-progress-v1:"' in script
    assert 'badge.textContent = "読了"' in script
    assert 'if (scrollY >= 140)' in script
    assert 'el("work-progress-bar")' in script
    assert 'function resetWorkReadingStatus()' in script
    assert 'function renderWorkReadingStatus()' in script
    assert 'localStorage.removeItem(PROGRESS_KEY + path)' in script
    assert 'localStorage.removeItem("velune-reader-scroll:" + path)' in script
    assert 'episodePaths.includes(last.path)' in script
    assert 'el("confirm-reset-reading")?.addEventListener("click"' in script
    assert 'resetDialog?.addEventListener("close", releaseReaderScroll)' in script
    assert 'renderWorkReadingStatus();' in script
    assert 'localStorage.clear()' not in script
    assert 'localStorage.removeItem(KEY)' not in script
    assert "readerWidth" not in script
    assert "if (scrollY >= 140) {" in script
    assert "save(LAST, {path, title})" in script
    # Dialogs must lock the underlying novel and restore the exact scroll position.
    assert "body.reader-overlay-open" in css
    assert "html.reader-overlay-open" in css
    assert ".brand{flex:0 1 auto;display:inline-flex" in css
    assert ".work-hero{" in css
    assert ".work-episodes .episode-status{" in css
    assert ".brand img{" in css
    assert "#chapter-list{position:fixed;inset:0;margin:auto" in css
    assert "inset:0;margin:auto" in css
    assert ".prose{max-width:680px" in css
    assert ".synopsis-expander" in css
    assert "overscroll-behavior:contain" in css
    assert "function openReaderOverlay(element)" in script
    assert "window.scrollTo({top: lockedReaderY" in script
    assert 'dialog?.addEventListener("close", releaseReaderScroll)' in script
    assert 'tocDialog?.addEventListener("close", releaseReaderScroll)' in script
    assert "if (openOverlays > 0)" in script




def check_markdown_fidelity(temp: Path) -> None:
    # Keep Markdown for real formatting; forum references must stay literal.
    story = temp / "第900話.md"
    story.write_text(
        "---\ntype: episode_prose\nstatus: PENDING\n---\n\n"
        "# 第900話「表示検査」\n\n"
        ">>3  \n>>14  \n掲示板のレス\n\n"
        "次スレは>>950  \nコメント行\n\n"
        "> 本当の引用\n\n"
        ">> 二段の引用\n\n"
        "**太字**と[リンク](https://example.org)\n\n"
        "- 箇条書き\n\n"
        "```text\n>>8\n```\n\n"
        "　全角字下げの段落。\n\n"
        "<script>alert(1)</script>\n",
        encoding="utf-8"
    )
    episode = mod.episode_data(story)
    output = episode["html"]
    assert episode["number"] == 900
    assert output.startswith("<h1>第900話")
    assert "&gt;&gt;3<br" in output and "&gt;&gt;14<br" in output
    assert "次スレは&gt;&gt;950<br" in output
    assert output.count("<blockquote>") == 3  # real quotation and nested quotation
    assert "<p>本当の引用</p>" in output
    assert "<strong>太字</strong>" in output
    assert '<a href="https://example.org">リンク</a>' in output
    assert "<ul>" in output and "<li>箇条書き</li>" in output
    assert "<pre><code" in output and "&gt;&gt;8" in output
    assert r"\>\>8" not in output
    assert "　全角字下げの段落。" in output
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in output
    assert "status: PENDING" not in output


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="velune-work-check-") as folder:
        temp = Path(folder)
        check_markdown_fidelity(temp)
        source, dest = temp / "works", temp / "dist"
        source.mkdir()
        revalna = fixture(source, "revalna", "リヴェルナ・オンライン",
                          description="作品の紹介文" + "。ゆっくり読む物語" * 35 + " <script>private</script>")
        (revalna / "第001話.md").write_text(
            "---\ntype: episode_prose\nstatus: PENDING\nstory_adopted: false\n"
            "source_plot: secret/path\n---\n"
            "# 第001話「ランダムは1回だけ」\n\n　本文です。\n",
            encoding="utf-8")
        (revalna / "第003話.md").write_text(
            "# 第003話「三番目の題名」\n\n　本文です。\n", encoding="utf-8")
        template = fixture(source, "_template", "テンプレート", published=True)
        (template / "第001話.md").write_text(
            "# 第001話「公開禁止」\n\nSECRET-TEMPLATE\n", encoding="utf-8")
        draft = fixture(source, "draft", "未公開作品", published=False)
        (draft / "第001話.md").write_text(
            "# 第001話「未公開」\n\nSECRET-DRAFT\n", encoding="utf-8")
        check_build(source, dest, {"revalna": ["001.html", "003.html"]})
        chapter = (dest / "works" / "revalna" / "episodes" / "001.html").read_text(encoding="utf-8")
        assert "ランダムは1回だけ" in chapter
        assert "　本文です。" in chapter
        (revalna / "第002話.md").write_text("# 第002話「追加」\n\n　本文\n", encoding="utf-8")
        second = fixture(source, "second-work", "もうひとつの物語")
        (second / "第001話.md").write_text("# 第001話「始まり」\n\n　別作品\n", encoding="utf-8")
        check_build(source, dest, {"revalna": ["001.html", "002.html", "003.html"],
                                   "second-work": ["001.html"]})
        (revalna / "第001話.md").unlink()
        check_build(source, dest, {"revalna": ["002.html", "003.html"],
                                   "second-work": ["001.html"]})
        assert not (dest / "works" / "revalna" / "episodes" / "001.html").exists()
        print("PASS: multi-work titles, dynamics, template and private metadata exclusion")


if __name__ == "__main__":
    main()
