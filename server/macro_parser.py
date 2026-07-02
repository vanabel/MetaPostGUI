"""Discover def/vardef macros in mpostdef source (with optional input resolution)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from mpost_parser import extract_mpostdef
from plugin_loader import collect_plugins

_MPOSTDEF_ENV_RE = re.compile(
    r"\\begin\{mpostdef\}(?:\[[^\]]*\])?\s*(.*?)\\end\{mpostdef\}",
    re.DOTALL,
)
_INPUT_RE = re.compile(r"^\s*input\s+([^\s;]+)\s*;?\s*$")
_MACRO_RE = re.compile(
    r"(?:^|\n)\s*(def|vardef)\s+([a-zA-Z_]\w*)\s*(?:\(([^)]*)\))?(?:\(([^)]*)\))?",
    re.MULTILINE,
)
_PARAM_RE = re.compile(r"^(expr|text|suffix|primary)\s+(.+)$")


def strip_mpost_comments(source: str) -> str:
    lines: list[str] = []
    for line in source.splitlines():
        if "%" in line:
            line = line.split("%", 1)[0]
        lines.append(line)
    return "\n".join(lines)


def normalize_mpostdef_source(source: str) -> str:
    text = source.strip()
    if "\\begin{mpostdef}" in text:
        text = extract_mpostdef(text)
    return strip_mpost_comments(text)


def _resolve_input_name(name: str, search_dirs: list[Path]) -> Path | None:
    raw = name.strip().strip('"').strip("'")
    candidates: list[Path] = []
    for base in search_dirs:
        p = (base / raw).resolve()
        candidates.append(p)
        if not raw.endswith(".mp"):
            candidates.append((base / f"{raw}.mp").resolve())
    for path in candidates:
        if path.is_file():
            return path
    return None


def expand_inputs(
    source: str,
    search_dirs: list[Path],
    *,
    _seen: set[Path] | None = None,
    _depth: int = 0,
) -> str:
    if _depth > 32:
        return source
    if _seen is None:
        _seen = set()

    chunks: list[str] = []
    for line in source.splitlines():
        m = _INPUT_RE.match(line.strip())
        if not m:
            chunks.append(line)
            continue
        path = _resolve_input_name(m.group(1), search_dirs)
        if path is None or path in _seen:
            chunks.append(line)
            continue
        _seen.add(path)
        nested = normalize_mpostdef_source(path.read_text(encoding="utf-8"))
        chunks.append(expand_inputs(nested, search_dirs, _seen=_seen, _depth=_depth + 1))
    return "\n".join(chunks)


def _parse_params(sig: str) -> list[dict[str, str]]:
    if not sig.strip():
        return []
    params: list[dict[str, str]] = []
    for part in sig.split(","):
        part = part.strip()
        if not part:
            continue
        m = _PARAM_RE.match(part)
        if m:
            params.append({"kind": m.group(1), "name": m.group(2).strip()})
        else:
            params.append({"kind": "expr", "name": part})
    return params


def parse_macro_tools(source: str) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    seen: set[str] = set()
    for m in _MACRO_RE.finditer(source):
        name = m.group(2)
        if name in seen:
            continue
        seen.add(name)
        params = _parse_params(m.group(3) or "")
        if m.group(4):
            if name == "drawfun":
                params = [*params, {"kind": "text", "name": "f"}]
            else:
                params.extend(_parse_params(m.group(4)))
        tools.append(
            {
                "name": name,
                "kind": m.group(1),
                "params": params,
                "defaults": {},
            }
        )
    tools.sort(key=lambda t: t["name"])
    return tools


def load_tool_defaults(config_dir: Path) -> dict[str, dict[str, str]]:
    path = config_dir / "tool-defaults.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_") and isinstance(v, dict)}


def prepare_mpostdef(
    mpostdef: str,
    plugin_dirs: list[Path],
    search_dirs: list[Path],
) -> str:
    """并入插件宏，并按搜索路径内联展开 input（供编译与导出）。"""
    from plugin_loader import augment_mpostdef

    combined = augment_mpostdef(mpostdef, plugin_dirs)
    return expand_inputs(combined, search_dirs)


def discover_macros(
    mpostdef: str,
    search_dirs: list[Path],
    config_dir: Path,
    *,
    resolve_inputs: bool = True,
    plugin_dirs: list[Path] | None = None,
) -> dict[str, Any]:
    normalized = normalize_mpostdef_source(mpostdef)
    plugin_source = ""
    plugin_defaults: dict[str, dict[str, str]] = {}
    plugins_loaded: list[dict[str, Any]] = []
    if plugin_dirs:
        plugin_source, plugin_defaults, plugins_loaded = collect_plugins(plugin_dirs)

    combined = normalized
    if plugin_source.strip():
        combined = f"{normalized}\n\n{plugin_source}" if normalized.strip() else plugin_source

    expanded = expand_inputs(combined, search_dirs) if resolve_inputs else combined
    tools = parse_macro_tools(expanded)
    defaults = load_tool_defaults(config_dir)
    tool_help: dict[str, dict[str, Any]] = {}
    for plugin in plugins_loaded:
        tn = plugin.get("tool_name")
        if not isinstance(tn, str):
            continue
        tool_help[tn] = {
            "description": plugin.get("tool_description", ""),
            "param_docs": plugin.get("param_docs", {}),
        }

    for tool in tools:
        tool["defaults"] = {
            **defaults.get(tool["name"], {}),
            **plugin_defaults.get(tool["name"], {}),
            **tool.get("defaults", {}),
        }
        help_info = tool_help.get(tool["name"], {})
        desc = help_info.get("description")
        if isinstance(desc, str) and desc.strip():
            tool["description"] = desc.strip()
        docs = help_info.get("param_docs")
        if isinstance(docs, dict):
            for p in tool["params"]:
                d = docs.get(p["name"])
                if isinstance(d, str) and d.strip():
                    p["description"] = d.strip()
    return {
        "tools": tools,
        "plugins": plugins_loaded,
        "plugin_source": plugin_source,
        "source_normalized": normalized,
        "source_expanded": expanded,
        "resolved_input_count": expanded.count("\n") - normalized.count("\n") + (
            1 if len(expanded) > len(normalized) else 0
        ),
    }
