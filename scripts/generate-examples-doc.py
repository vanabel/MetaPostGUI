#!/usr/bin/env python3
"""Generate docs/EXAMPLES.md from examples/manifest.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "examples" / "manifest.json"
OUT = ROOT / "docs" / "EXAMPLES.md"


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    examples = data.get("examples", [])
    featured = sorted(
        [ex for ex in examples if ex.get("featured_level")],
        key=lambda ex: (ex.get("featured_order", 9999), ex.get("id", "")),
    )
    by_source: dict[str, list] = {}
    for ex in examples:
        by_source.setdefault(ex.get("source", "?"), []).append(ex)

    lines = [
        "# 例子目录",
        "",
        "由 `scripts/generate-examples-doc.py` 从 `examples/manifest.json` 自动生成，请勿手工编辑。",
        "",
        f"共 **{len(examples)}** 条。详见 [EXAMPLES_ROADMAP.md](EXAMPLES_ROADMAP.md)。",
        "",
    ]

    if featured:
        level_label = {
            "basic": "基础",
            "intermediate": "中等",
            "advanced": "高级",
        }
        lines.append(f"## 精选代表 ({len(featured)})")
        lines.append("")
        lines.append("| id | 标题 | 层级 | 分类 | 代表性 |")
        lines.append("|----|------|------|------|--------|")
        for ex in featured:
            title = str(ex.get("title", "")).replace("|", "\\|")[:60]
            reason = str(ex.get("featured_reason", "")).replace("|", "\\|")[:80]
            level = level_label.get(ex.get("featured_level"), str(ex.get("featured_level", "")))
            lines.append(
                f"| `{ex['id']}` | {title} | {level} | {ex.get('category','')} | {reason} |"
            )
        lines.append("")

    for source in sorted(by_source.keys()):
        items = by_source[source]
        lines.append(f"## {source} ({len(items)})")
        lines.append("")
        lines.append("| id | 标题 | tier | 分类 | 编译 |")
        lines.append("|----|------|------|------|------|")
        for ex in items[:80]:
            expect = (ex.get("expect") or {}).get("compile", "pass")
            title = str(ex.get("title", "")).replace("|", "\\|")[:60]
            lines.append(
                f"| `{ex['id']}` | {title} | {ex.get('tier','')} | {ex.get('category','')} | {expect} |"
            )
        if len(items) > 80:
            lines.append(f"| … | 另有 {len(items) - 80} 条 | | | |")
        lines.append("")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
