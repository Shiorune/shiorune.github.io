#!/usr/bin/env python3
"""Regression checks for scheduled-publication change detection."""
from pathlib import Path
from tempfile import TemporaryDirectory

from publication_revision import fingerprint, is_current, marker, write_marker


def main() -> None:
    source_tree = "a" * 40
    reader_tree = "b" * 40
    with TemporaryDirectory() as folder:
        path = Path(folder) / "publication-revision.json"
        assert not is_current(path, source_tree, reader_tree)
        write_marker(path, source_tree, reader_tree)
        assert is_current(path, source_tree, reader_tree)
        assert not is_current(path, "c" * 40, reader_tree)
        assert not is_current(path, source_tree, "c" * 40)
        assert marker(source_tree, reader_tree)["revision"] == fingerprint(source_tree, reader_tree)
        assert source_tree not in path.read_text(encoding="utf-8")
        assert reader_tree not in path.read_text(encoding="utf-8")
        path.write_text("{bad json", encoding="utf-8")
        assert not is_current(path, source_tree, reader_tree)
        path.write_text('{"format": 0, "revision": "old"}', encoding="utf-8")
        assert not is_current(path, source_tree, reader_tree)
    print("PASS: publication fingerprint skips unchanged releases and detects changes")


if __name__ == "__main__":
    main()
