#!/usr/bin/env python3
"""Import tlhiv MetaPost examples from saved HTML into examples/tlhiv/ + manifest.json."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

TLHIV_URL = "http://www.tlhiv.org/MetaPost/examples/examples.html"

BEGINFIG_RE = re.compile(r"beginfig\s*\(\s*(\d+)\s*\)", re.I)
ENDFIG_RE = re.compile(r"endfig\s*;?", re.I)

TIER_C_PATTERNS = [
    r"\bdef\b",
    r"\bvardef\b",
    r"\bfor\b",
    r"\bgraph\b",
    r"\bendgraph\b",
    r"\binput\b",
    r"\bTEX\s*\(",
    r"\bscantokens\b",
    r"\bwrite\b",
    r"\benddef\b",
    r"\bdrawboxed\b",
    r"\bdrawunboxed\b",
    r"\bpascal\b",
    r"\btension\b",
    r"\{right\}",
    r"\{left\}",
    r"\{up\}",
    r"\{down\}",
    r"\{dir\b",
]
TIER_B_PATTERNS = [
    r"\bwithpen\b",
    r"\bwithcolor\b",
    r"\blabel\b",
    r"\bdashed\b",
    r"\bfilldraw\b",
    r"\bdrawarrow\b",
    r"\bdotlabel\b",
    r"\bfill\b",
    r"\binterim\b",
]


def strip_html_preamble(text: str) -> str:
    """Remove saved-fetch header lines before first beginfig."""
    idx = re.search(r"beginfig\s*\(", text, re.I)
    if idx:
        return text[idx.start() :]
    return text


def split_figures(text: str) -> list[tuple[int, str]]:
    text = strip_html_preamble(text)
    parts = re.split(r"\n---+\n", text)
    figures: list[tuple[int, str]] = []
    for block in parts:
        block = block.strip()
        if not block or block.lower().startswith("bye"):
            continue
        m = BEGINFIG_RE.search(block)
        if not m:
            continue
        num = int(m.group(1))
        body = BEGINFIG_RE.sub("", block, count=1).strip()
        body = ENDFIG_RE.sub("", body, count=1).strip()
        if body:
            figures.append((num, body))
    return figures


def classify_tier(body: str) -> str:
    for pat in TIER_C_PATTERNS:
        if re.search(pat, body, re.I):
            return "C"
    # Uses coordinate symbol u without local definition
    if re.search(r"\(\s*[^)]*,\s*u\s*\)|\(\s*u\s*,", body) and not re.search(
        r"\bu\s*:=", body
    ):
        return "C"
    for pat in TIER_B_PATTERNS:
        if re.search(pat, body, re.I):
            return "B"
    return "A"


def classify_category(body: str, tier: str) -> str:
    if tier == "C" and re.search(r"\b(def|vardef)\b", body, re.I):
        return "macro"
    if re.search(r"\blabel\b|\bdotlabel\b", body, re.I):
        return "label"
    if re.search(r"\bwithpen\b", body, re.I):
        return "pen"
    if re.search(r"\.\.|controls|subpath|fullcircle", body, re.I):
        return "path"
    if tier == "C":
        return "advanced"
    return "basic"


def guess_title(num: int, body: str) -> str:
    first_draw = re.search(r"^\s*draw\w*\s+(.+)$", body, re.M | re.I)
    if first_draw:
        snippet = first_draw.group(1).strip()[:48]
        return f"Fig {num}: {snippet}"
    return f"Figure {num}"


def extract_tags(body: str) -> list[str]:
    tags: list[str] = []
    if re.search(r"--cycle", body):
        tags.append("cycle")
    if re.search(r"\bdrawarrow\b", body, re.I):
        tags.append("arrow")
    if re.search(r"\.\.", body):
        tags.append("spline")
    if re.search(r"\bwithpen\b", body, re.I):
        tags.append("pen")
    if re.search(r"\blabel\b", body, re.I):
        tags.append("label")
    return tags[:8]


def features_for(body: str) -> list[str]:
    feats: list[str] = []
    if re.search(r"\bTEX\s*\(", body):
        feats.append("btex")
    if re.search(r"\bfor\b", body, re.I):
        feats.append("for-loop")
    if re.search(r"\bgraph\b", body, re.I):
        feats.append("graph")
    if re.search(r"\b(def|vardef)\b", body, re.I):
        feats.append("inline-def")
    if re.search(r"\binput\b", body, re.I):
        feats.append("input")
    return feats


def build_curated_entries() -> list[dict]:
    """MetaPostGUI scaled-u examples for canvas sync demos."""
    return [
        {
            "id": "curated-grid-segment",
            "title": "网格 + 线段",
            "description": "默认 drawgrid 与 scaled u 线段",
            "source": "curated",
            "category": "basic",
            "figure_file": "curated/grid-segment.mp",
            "mpostdef": "",
            "mposttex": "",
            "plugins": [],
            "tags": ["drawgrid", "segment"],
            "tier": "A",
            "features": [],
            "expect": {
                "compile": "pass",
                "parse_coverage_min": 0.8,
                "canvas_sync": "required",
            },
        },
        {
            "id": "curated-bezier",
            "title": "平滑路径 Bezier",
            "source": "curated",
            "category": "path",
            "figure_file": "curated/bezier.mp",
            "mpostdef": "",
            "plugins": [],
            "tags": ["mpath"],
            "tier": "A",
            "features": [],
            "expect": {
                "compile": "pass",
                "parse_coverage_min": 0.8,
                "canvas_sync": "required",
            },
        },
        {
            "id": "curated-circle-arrow",
            "title": "圆与箭头",
            "source": "curated",
            "category": "basic",
            "figure_file": "curated/circle-arrow.mp",
            "mpostdef": "",
            "plugins": [],
            "tags": ["circle", "arrow"],
            "tier": "A",
            "features": [],
            "expect": {
                "compile": "pass",
                "parse_coverage_min": 0.6,
                "canvas_sync": "required",
            },
        },
    ]


def build_thruston_demo_entries() -> list[dict]:
    return [
        {
            "id": "thruston-mark-angle-demo",
            "title": "角标记 (markle)",
            "description": "GPL-3.0 · thruston/metapost-examples",
            "source": "thruston",
            "source_url": "https://github.com/thruston/metapost-examples",
            "category": "macro",
            "figure_file": "curated/mark-angle-demo.mp",
            "mpostdef": "",
            "plugins": ["mark-angle"],
            "tags": ["macro", "angle"],
            "tier": "B",
            "features": [],
            "expect": {"compile": "pass", "canvas_sync": "none"},
        },
        {
            "id": "thruston-arrow-label-demo",
            "title": "双向箭头标签",
            "source": "thruston",
            "source_url": "https://github.com/thruston/metapost-examples",
            "category": "label",
            "figure_file": "curated/arrow-label-demo.mp",
            "mpostdef": "",
            "plugins": ["arrow-label"],
            "tags": ["macro", "arrow", "label"],
            "tier": "B",
            "features": [],
            "expect": {"compile": "pass", "canvas_sync": "none"},
        },
    ]


def normalize_body(body: str) -> str:
    """Collapse whitespace so multi-line draw/path statements compile after sanitize."""
    return body


def write_figure_body(path: Path, body: str) -> None:
    parts = [p.strip() for p in body.splitlines() if p.strip() and not p.strip().startswith("%")]
    if parts and re.match(r"^draw\b", parts[0], re.I) and len(parts) > 1:
        text = " ".join(parts)
    else:
        text = "\n".join(parts) if parts else body.strip()
    path.write_text(text.strip() + "\n", encoding="utf-8")


def read_tlhiv_html(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        # tlhiv currently declares UTF-8, but older examples use Latin-1 bytes.
        return raw.decode("latin-1")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "html",
        nargs="?",
        type=Path,
        help="tlhiv examples HTML (saved page)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max tlhiv figures to import (0 = all)",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
    )
    args = parser.parse_args()

    root = args.project_root
    examples_dir = root / "examples"
    tlhiv_dir = examples_dir / "tlhiv"
    curated_dir = examples_dir / "curated"
    tlhiv_dir.mkdir(parents=True, exist_ok=True)
    curated_dir.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []

    html_path = args.html
    if html_path is None:
        candidates = [
            root / "examples" / "source" / "tlhiv-examples.html",
            Path.home()
            / ".cursor/projects/Users-vanabel-development-TEX-MetaPostGUI/uploads/examples-1.html",
        ]
        for c in candidates:
            if c.is_file():
                html_path = c
                break

    if html_path and html_path.is_file():
        text = read_tlhiv_html(html_path)
        figures = split_figures(text)
        if args.limit > 0:
            figures = figures[: args.limit]
        for num, body in figures:
            tier = classify_tier(body)
            eid = f"tlhiv-{num:03d}"
            fname = f"{num:03d}.mp"
            write_figure_body(tlhiv_dir / fname, body)
            expect_compile = "pass"
            if tier == "C" and re.search(r"\b(graph|TEX\s*\(|write\b)", body, re.I):
                expect_compile = "skip"
            entries.append(
                {
                    "id": eid,
                    "title": guess_title(num, body),
                    "source": "tlhiv",
                    "source_url": TLHIV_URL,
                    "category": classify_category(body, tier),
                    "figure_file": f"tlhiv/{fname}",
                    "mpostdef": "",
                    "mposttex": "",
                    "plugins": [],
                    "tags": extract_tags(body),
                    "tier": tier,
                    "features": features_for(body),
                    "expect": {
                        "compile": expect_compile,
                        "parse_coverage_min": 0.0,
                        "canvas_sync": "none",
                    },
                }
            )
        print(f"Imported {len(figures)} tlhiv figures from {html_path}")
    else:
        print("No tlhiv HTML found; skipping tlhiv import")

    entries.extend(build_curated_entries())
    entries.extend(build_thruston_demo_entries())

    manifest = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "examples": entries,
    }
    out = examples_dir / "manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {out}")


if __name__ == "__main__":
    main()
