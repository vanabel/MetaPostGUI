#!/usr/bin/env python3
"""Scan manifest for inline def/vardef and write macro-candidates report."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "examples" / "manifest.json"
OUT = ROOT / "examples" / "reports" / "macro-candidates.json"

DEF_RE = re.compile(
    r"^\s*(def|vardef)\s+([a-zA-Z_]\w*)\s*",
    re.M | re.I,
)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    names: Counter[str] = Counter()
    by_example: list[dict] = []

    for ex in data.get("examples", []):
        body = ex.get("figure", "")
        if ex.get("figure_file"):
            fp = ROOT / "examples" / ex["figure_file"]
            if fp.is_file():
                body = fp.read_text(encoding="utf-8")
        found = DEF_RE.findall(body)
        if not found:
            continue
        macros = [m[1] for m in found]
        for name in macros:
            names[name] += 1
        by_example.append({"id": ex["id"], "macros": macros})

    report = {
        "top_macros": [{"name": n, "count": c} for n, c in names.most_common(30)],
        "examples_with_inline_macros": len(by_example),
        "samples": by_example[:20],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(names)} unique macro names)")


if __name__ == "__main__":
    main()
