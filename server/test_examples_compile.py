"""Batch compile examples from manifest; write examples/reports/compile-latest.json."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from compiler import compile_figure
from examples_loader import EXAMPLES_DIR, augment_mpostdef_for_example, iter_examples
from macro_parser import normalize_mpostdef_source
from mpost_parser import extract_mposttex
from tex_paths import find_mpost

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
DEFAULT_MPOSTDEF = CONFIG_DIR / "default-mpostdef.tex"
DEFAULT_MPOSTTEX = CONFIG_DIR / "default-mposttex.tex"
REPORT_PATH = EXAMPLES_DIR / "reports" / "compile-latest.json"


def _default_mposttex() -> str:
    if DEFAULT_MPOSTTEX.is_file():
        raw = DEFAULT_MPOSTTEX.read_text(encoding="utf-8")
        return extract_mposttex(raw) if "\\begin{mposttex}" in raw else raw
    return ""


def _default_mpostdef() -> str:
    if DEFAULT_MPOSTDEF.is_file():
        return normalize_mpostdef_source(DEFAULT_MPOSTDEF.read_text(encoding="utf-8"))
    return "u=10pt;"


def run_compile_report(
  *,
  tiers: set[str] | None = None,
  write_report: bool = True,
) -> dict:
    mpost = find_mpost(CONFIG_DIR)
    if not mpost:
        return {"ok": False, "error": "mpost not found", "results": []}

    base_def = _default_mpostdef()
    entries = iter_examples(tiers=tiers or {"A", "B"}, compile_expect={"pass"})
    results: list[dict] = []
    passed = failed = skipped = 0
    t0 = time.perf_counter()

    for ex in entries:
        eid = ex["id"]
        figure = ex.get("figure_resolved", "")
        extra_def = str(ex.get("mpostdef") or "")
        plugins = list(ex.get("plugins") or [])
        mpostdef = augment_mpostdef_for_example(
            f"{base_def}\n{extra_def}".strip(),
            plugins,
        )
        mposttex = str(ex.get("mposttex") or "") or _default_mposttex()

        try:
            result = compile_figure(figure=figure, mpostdef=mpostdef, mposttex=mposttex)
            ok = result.ok and bool(result.svg and result.svg.strip())
            row = {
                "id": eid,
                "tier": ex.get("tier"),
                "ok": ok,
                "log_tail": (result.log or "")[-500:] if not ok else "",
            }
            if ok:
                passed += 1
            else:
                failed += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            row = {
                "id": eid,
                "tier": ex.get("tier"),
                "ok": False,
                "log_tail": str(exc),
            }
        results.append(row)

    elapsed = time.perf_counter() - t0
    report = {
        "ok": failed == 0,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "total": len(results),
        "elapsed_sec": round(elapsed, 2),
        "results": results,
    }
    if write_report:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


@pytest.fixture(scope="module")
def mpost_available() -> None:
    if not find_mpost(CONFIG_DIR):
        pytest.skip("mpost not installed")


def test_examples_compile_batch(mpost_available: None) -> None:
    """Tier A examples must compile; tier B failures are reported but do not fail CI."""
    report_a = run_compile_report(tiers={"A"}, write_report=False)
    failures_a = [r for r in report_a["results"] if not r["ok"]]
    run_compile_report(tiers={"A", "B"}, write_report=True)
    if failures_a:
        msg = "; ".join(r["id"] for r in failures_a[:8])
        pytest.fail(f"{len(failures_a)}/{report_a['total']} tier-A examples failed (e.g. {msg})")


def test_curated_examples_compile(mpost_available: None) -> None:
    entries = iter_examples(compile_expect={"pass"})
    curated = [e for e in entries if str(e.get("source")) == "curated"]
    assert curated, "no curated examples in manifest"
    base_def = _default_mpostdef()
    for ex in curated:
        mpostdef = augment_mpostdef_for_example(
            f"{base_def}\n{ex.get('mpostdef', '')}".strip(),
            list(ex.get("plugins") or []),
        )
        result = compile_figure(
            figure=ex["figure_resolved"],
            mpostdef=mpostdef,
            mposttex=str(ex.get("mposttex") or "") or _default_mposttex(),
        )
        assert result.ok, f"{ex['id']}: {result.log[-300:]}"


def test_featured_examples_compile(mpost_available: None) -> None:
    entries = iter_examples(compile_expect={"pass"})
    featured = [e for e in entries if e.get("featured_level")]
    assert len(featured) == 16, "featured examples should stay at 16"
    base_def = _default_mpostdef()
    for ex in featured:
        mpostdef = augment_mpostdef_for_example(
            f"{base_def}\n{ex.get('mpostdef', '')}".strip(),
            list(ex.get("plugins") or []),
        )
        result = compile_figure(
            figure=ex["figure_resolved"],
            mpostdef=mpostdef,
            mposttex=str(ex.get("mposttex") or "") or _default_mposttex(),
        )
        assert result.ok and result.svg.strip(), f"{ex['id']}: {result.log[-300:]}"
