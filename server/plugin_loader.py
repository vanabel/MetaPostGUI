"""Load MetaPostGUI macro plugins from *.plugin.json (one file = one plugin)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_ID_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


def _normalize_macros(source: str) -> str:
    from macro_parser import normalize_mpostdef_source

    return normalize_mpostdef_source(source)


def _parse_tool_docs(tool: dict[str, Any]) -> tuple[str | None, str, dict[str, str]]:
    """从 tool 段解析宏名、宏说明与各参数说明。"""
    name = tool.get("name") if isinstance(tool.get("name"), str) else None
    desc = str(tool.get("description") or tool.get("help") or "")
    docs: dict[str, str] = {}
    param_docs = tool.get("paramDocs")
    if isinstance(param_docs, dict):
        docs = {str(k): str(v) for k, v in param_docs.items() if str(v).strip()}
    params = tool.get("params")
    if isinstance(params, list):
        for item in params:
            if not isinstance(item, dict):
                continue
            n = item.get("name")
            d = item.get("description")
            if isinstance(n, str) and isinstance(d, str) and d.strip():
                docs[n] = d.strip()
    return name, desc, docs


def _validate_plugin(data: dict[str, Any], path: Path) -> list[str]:
    errors: list[str] = []
    pid = data.get("id")
    if not isinstance(pid, str) or not _ID_RE.match(pid):
        errors.append(f"{path.name}: id 须为小写字母开头的 a-z0-9_- 字符串")
    if not data.get("macros") and not data.get("input"):
        errors.append(f"{path.name}: 须提供 macros 或 input")
    tool = data.get("tool")
    if tool is not None and not isinstance(tool, dict):
        errors.append(f"{path.name}: tool 须为对象")
    return errors


def load_plugin_file(path: Path) -> tuple[dict[str, Any], str, dict[str, dict[str, str]]] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("enabled") is False:
        return None
    if _validate_plugin(data, path):
        return None

    macros = ""
    if isinstance(data.get("macros"), str):
        macros = _normalize_macros(data["macros"])
    elif isinstance(data.get("input"), str):
        mp_path = (path.parent / data["input"]).resolve()
        if mp_path.is_file():
            macros = _normalize_macros(mp_path.read_text(encoding="utf-8"))

    if not macros.strip():
        return None

    meta = {
        "id": data["id"],
        "title": data.get("title") or data["id"],
        "description": data.get("description", ""),
        "version": data.get("version", ""),
        "author": data.get("author", ""),
        "file": str(path),
    }
    plugin_defaults: dict[str, dict[str, str]] = {}
    tool = data.get("tool")
    if isinstance(tool, dict):
        tool_name, tool_description, param_docs = _parse_tool_docs(tool)
        tool_defaults = tool.get("defaults")
        if isinstance(tool_name, str) and isinstance(tool_defaults, dict):
            plugin_defaults[tool_name] = {
                k: str(v) for k, v in tool_defaults.items() if not str(k).startswith("_")
            }
        if tool_name:
            meta["tool_name"] = tool_name
        if tool_description:
            meta["tool_description"] = tool_description
        if param_docs:
            meta["param_docs"] = param_docs
    return meta, macros, plugin_defaults


def collect_plugins(
    dirs: list[Path],
) -> tuple[str, dict[str, dict[str, str]], list[dict[str, Any]]]:
    """返回拼接的宏源码、工具默认参数、已加载插件元数据。"""
    chunks: list[str] = []
    defaults: dict[str, dict[str, str]] = {}
    loaded: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for base in dirs:
        if not base.is_dir():
            continue
        for path in sorted(base.glob("*.plugin.json")):
            parsed = load_plugin_file(path)
            if parsed is None:
                continue
            meta, macros, plugin_defaults = parsed
            if meta["id"] in seen_ids:
                continue
            seen_ids.add(meta["id"])
            chunks.append(f"% --- plugin: {meta['id']} ---\n{macros}")
            loaded.append({**meta, "source": macros})
            defaults.update(plugin_defaults)

    return "\n\n".join(chunks), defaults, loaded


def augment_mpostdef(mpostdef: str, plugin_dirs: list[Path]) -> str:
    """将已启用插件的宏定义并入 mpostdef（编译与扫描一致）。"""
    plugin_source, _, _ = collect_plugins(plugin_dirs)
    if not plugin_source.strip():
        return mpostdef
    normalized = _normalize_macros(mpostdef)
    if normalized.strip():
        return f"{normalized}\n\n{plugin_source}"
    return plugin_source


def plugin_search_dirs(config_dir: Path, extra: list[str] | None = None) -> list[Path]:
    dirs: list[Path] = [config_dir / "plugins"]
    home = Path.home() / ".metapostgui" / "plugins"
    dirs.append(home)
    if extra:
        for p in extra:
            path = Path(p).expanduser().resolve()
            if path.is_dir():
                dirs.append(path)
    return dirs
