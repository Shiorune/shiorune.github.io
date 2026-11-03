#!/usr/bin/env python3
"""Compare deployed release fingerprints without exposing private-source revision IDs."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def fingerprint(source_tree: str, reader_tree: str) -> str:
    """A release changes when the source works or reader files change."""
    message = f"shiorune-publication-v1\0{source_tree}\0{reader_tree}"
    return hashlib.sha256(message.encode("utf-8")).hexdigest()


def marker(source_tree: str, reader_tree: str) -> dict:
    return {"format": 1, "revision": fingerprint(source_tree, reader_tree)}


def is_current(path: Path, source_tree: str, reader_tree: str) -> bool:
    try:
        previous = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    return previous == marker(source_tree, reader_tree)


def write_marker(path: Path, source_tree: str, reader_tree: str) -> None:
    path.write_text(
        json.dumps(marker(source_tree, reader_tree), sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "write"))
    parser.add_argument("path", type=Path)
    parser.add_argument("source_tree")
    parser.add_argument("reader_tree")
    args = parser.parse_args()
    if args.command == "write":
        write_marker(args.path, args.source_tree, args.reader_tree)
    elif not is_current(args.path, args.source_tree, args.reader_tree):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
