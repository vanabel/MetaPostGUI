"""Load examples manifest and resolve figure bodies / plugin macros."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = PROJECT_ROOT / "examples"
MANIFEST_PATH = EXAMPLES_DIR / "manifest.json"
CONFIG_PLUGINS = PROJECT_ROOT / "config" / "plugins"

_PLUGIN_ID_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


def load_manifest(path: Path | None = None) -> dict[str, Any]:
    mp = path or MANIFEST_PATH
    if not mp.is_file():
        return {"version": 1, "examples": []}
    data = json.loads(mp.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Invalid manifest: {mp}")
    return data


def resolve_figure(entry: dict[str, Any], examples_dir: Path | None = None) -> str:
    if entry.get("figure"):
        return str(entry["figure"]).strip()
    rel = entry.get("figure_file")
    if not rel:
        return ""
    base = examples_dir or EXAMPLES_DIR
    fp = (base / str(rel)).resolve()
    if not fp.is_file():
        raise FileNotFoundError(f"figure_file not found: {fp}")
    return fp.read_text(encoding="utf-8").strip()


def iter_examples(
    *,
    tiers: set[str] | None = None,
    compile_expect: set[str] | None = None,
    manifest_path: Path | None = None,
) -> list[dict[str, Any]]:
    data = load_manifest(manifest_path)
    out: list[dict[str, Any]] = []
    for raw in data.get("examples", []):
        if not isinstance(raw, dict):
            continue
        tier = str(raw.get("tier", "C"))
        if tiers is not None and tier not in tiers:
            continue
        expect = raw.get("expect") or {}
        ce = str(expect.get("compile", "pass"))
        if compile_expect is not None and ce not in compile_expect:
            continue
        entry = dict(raw)
        entry["figure_resolved"] = resolve_figure(entry)
        out.append(entry)
    return out


def plugin_macros_for_ids(plugin_ids: list[str]) -> str:
    """Merge macros from config/plugins by plugin id (manifest plugins[] field)."""
    if not plugin_ids:
        return ""
    from plugin_loader import load_plugin_file

    chunks: list[str] = []
    for pid in plugin_ids:
        if not _PLUGIN_ID_RE.match(pid):
            continue
        path = CONFIG_PLUGINS / f"{pid}.plugin.json"
        if not path.is_file():
            continue
        parsed = load_plugin_file(path)
        if parsed is None:
            continue
        _, macros, _ = parsed
        if macros.strip():
            chunks.append(macros)
    return "\n\n".join(chunks)


def augment_mpostdef_for_example(mpostdef: str, plugin_ids: list[str]) -> str:
    from plugin_loader import augment_mpostdef, plugin_search_dirs

    base = augment_mpostdef(mpostdef, plugin_search_dirs(PROJECT_ROOT / "config", []))
    extra = plugin_macros_for_ids(plugin_ids)
    if not extra.strip():
        return base
    if base.strip():
        return f"{base}\n\n{extra}"
    return extra
