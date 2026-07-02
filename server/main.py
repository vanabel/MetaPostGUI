"""MetaPostGUI local compilation server."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from compiler import build_mp_source, build_mpostinl_export, compile_figure
from mpost_diagnostics import parse_mpost_diagnostics
from examples_loader import iter_examples, load_manifest, resolve_figure
from macro_parser import discover_macros, normalize_mpostdef_source, prepare_mpostdef
from plugin_loader import collect_plugins, plugin_search_dirs
from mpost_parser import extract_mpostdef, extract_mposttex
from tex_paths import (
    resolve_tex_toolchain,
    save_manual_tex_bin,
    normalize_tex_bin,
)

app = FastAPI(title="MetaPostGUI Server", version="0.1.0")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"


def _cors_origins() -> list[str]:
    extra = os.environ.get("METAPOSTGUI_CORS_ORIGINS", "").strip()
    if extra:
        return [o.strip() for o in extra.split(",") if o.strip()]
    web_port = os.environ.get("METAPOSTGUI_WEB_PORT", "5173")
    return [
        f"http://localhost:{web_port}",
        f"http://127.0.0.1:{web_port}",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_MPOSTDEF = CONFIG_DIR / "default-mpostdef.tex"
DEFAULT_MPOSTTEX = CONFIG_DIR / "default-mposttex.tex"


def _default_mpostdef_source() -> str:
    if not DEFAULT_MPOSTDEF.is_file():
        return ""
    return normalize_mpostdef_source(DEFAULT_MPOSTDEF.read_text(encoding="utf-8"))


def _default_mposttex_source() -> str:
    if not DEFAULT_MPOSTTEX.is_file():
        return ""
    raw = DEFAULT_MPOSTTEX.read_text(encoding="utf-8")
    return extract_mposttex(raw) if "\\begin{mposttex}" in raw else raw


def _mpostdef_with_default(source: str) -> str:
    return source if source.strip() else _default_mpostdef_source()


def _macro_search_dirs(extra: list[str] | None = None) -> list[Path]:
    dirs: list[Path] = [
        CONFIG_DIR,
        CONFIG_DIR / "plugins",
        PROJECT_ROOT,
        PROJECT_ROOT / "MetaPost-Script" / "snippets",
        PROJECT_ROOT.parent / "MetaPost-Script" / "snippets",
    ]
    if extra:
        for p in extra:
            path = Path(p).expanduser().resolve()
            if path.is_dir():
                dirs.append(path)
    return dirs


class CompileRequest(BaseModel):
    figure: str = Field(..., description="MetaPost code inside beginfig")
    mpostdef: str = ""
    mposttex: str = ""
    fig_num: int = 1
    plugin_paths: list[str] = Field(default_factory=list)
    search_paths: list[str] = Field(default_factory=list)


class ExportMpRequest(BaseModel):
    figure: str
    mpostdef: str = ""
    mposttex: str = ""
    fig_num: int = 1
    plugin_paths: list[str] = Field(default_factory=list)
    search_paths: list[str] = Field(default_factory=list)


class ExportMpostinlRequest(BaseModel):
    figure: str
    label: str = "fig-1"
    mpostdef: str = ""
    mposttex: str = ""
    mpostdef_path: str = "metapost/mpost-def.tex"
    mposttex_path: str = "metapost/mpost-tex.tex"
    show: bool = True
    mpostinl_options: str = "final,twice,latex"
    plugin_paths: list[str] = Field(default_factory=list)
    search_paths: list[str] = Field(default_factory=list)


class LoadFileRequest(BaseModel):
    path: str


class MacrosRequest(BaseModel):
    mpostdef: str = ""
    resolve_inputs: bool = True
    search_paths: list[str] = Field(default_factory=list)
    plugin_paths: list[str] = Field(default_factory=list)


class TexBinRequest(BaseModel):
    tex_bin: str = Field("", description="Directory containing mpost; empty clears manual override")


@app.get("/api/health")
def health() -> dict[str, Any]:
    toolchain = resolve_tex_toolchain(CONFIG_DIR)
    return {
        "ok": toolchain.ok,
        "mpost": toolchain.mpost,
        "latex": toolchain.latex,
        "tex_bin": toolchain.tex_bin,
        "tex_source": toolchain.source,
        "tex_hint": toolchain.hint,
        "platform": toolchain.platform,
        "default_mpostdef": str(DEFAULT_MPOSTDEF) if DEFAULT_MPOSTDEF.is_file() else None,
        "default_mposttex": str(DEFAULT_MPOSTTEX) if DEFAULT_MPOSTTEX.is_file() else None,
    }


@app.get("/api/tex-toolchain")
def tex_toolchain() -> dict[str, Any]:
    return resolve_tex_toolchain(CONFIG_DIR).to_dict()


@app.put("/api/tex-toolchain")
def set_tex_toolchain(req: TexBinRequest) -> dict[str, Any]:
    raw = req.tex_bin.strip()
    if raw:
        normalized = normalize_tex_bin(raw)
        if not normalized:
            raise HTTPException(
                status_code=400,
                detail=f"无效路径：需为包含 mpost 的目录（或 mpost 可执行文件本身）。当前：{raw}",
            )
        save_manual_tex_bin(CONFIG_DIR, str(normalized))
    else:
        save_manual_tex_bin(CONFIG_DIR, None)
    return resolve_tex_toolchain(CONFIG_DIR).to_dict()


@app.post("/api/compile")
def compile_endpoint(req: CompileRequest) -> dict[str, Any]:
    plugin_dirs = plugin_search_dirs(CONFIG_DIR, req.plugin_paths)
    mpostdef = prepare_mpostdef(
        _mpostdef_with_default(req.mpostdef),
        plugin_dirs,
        _macro_search_dirs(req.search_paths),
    )
    try:
        result = compile_figure(
            figure=req.figure,
            mpostdef=mpostdef,
            mposttex=req.mposttex,
            fig_num=req.fig_num,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "ok": result.ok,
        "svg": result.svg,
        "log": result.log,
        "mp_source": result.mp_source,
        "diagnostics": parse_mpost_diagnostics(
            result.log, result.mp_source, fig_num=req.fig_num
        ),
    }


@app.post("/api/export/mp")
def export_mp(req: ExportMpRequest) -> dict[str, str]:
    plugin_dirs = plugin_search_dirs(CONFIG_DIR, req.plugin_paths)
    mpostdef = prepare_mpostdef(
        _mpostdef_with_default(req.mpostdef),
        plugin_dirs,
        _macro_search_dirs(req.search_paths),
    )
    source = build_mp_source(
        figure=req.figure,
        mpostdef=mpostdef,
        mposttex=req.mposttex,
        fig_num=req.fig_num,
    )
    return {"filename": f"figure-{req.fig_num}.mp", "content": source}


@app.post("/api/export/mpostinl")
def export_mpostinl(req: ExportMpostinlRequest) -> dict[str, str]:
    plugin_dirs = plugin_search_dirs(CONFIG_DIR, req.plugin_paths)
    mpostdef = prepare_mpostdef(
        _mpostdef_with_default(req.mpostdef),
        plugin_dirs,
        _macro_search_dirs(req.search_paths),
    )
    return build_mpostinl_export(
        figure=req.figure,
        label=req.label,
        mpostdef=mpostdef,
        mposttex=req.mposttex,
        mpostdef_path=req.mpostdef_path,
        mposttex_path=req.mposttex_path,
        show=req.show,
        mpostinl_options=req.mpostinl_options,
    )


@app.post("/api/load-tex")
def load_tex(req: LoadFileRequest) -> dict[str, str]:
    path = Path(req.path).expanduser().resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    raw = path.read_text(encoding="utf-8")
    return {
        "path": str(path),
        "raw": raw,
        "mpostdef": normalize_mpostdef_source(extract_mpostdef(raw) if "\\begin{mpostdef}" in raw else raw),
        "mposttex": extract_mposttex(raw),
    }


@app.get("/api/defaults")
def defaults() -> dict[str, str]:
    return {"mpostdef": _default_mpostdef_source(), "mposttex": _default_mposttex_source()}


@app.post("/api/macros")
def macros_endpoint(req: MacrosRequest) -> dict[str, Any]:
    source = _mpostdef_with_default(req.mpostdef)
    plugin_dirs = plugin_search_dirs(CONFIG_DIR, req.plugin_paths)
    return discover_macros(
        source,
        _macro_search_dirs(req.search_paths),
        CONFIG_DIR,
        resolve_inputs=req.resolve_inputs,
        plugin_dirs=plugin_dirs,
    )


@app.get("/api/examples")
def list_examples(
    category: str | None = None,
    tier: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    data = load_manifest()
    items: list[dict[str, Any]] = []
    for raw in data.get("examples", []):
        if not isinstance(raw, dict):
            continue
        if category and raw.get("category") != category:
            continue
        if tier and raw.get("tier") != tier:
            continue
        if source and raw.get("source") != source:
            continue
        items.append(
            {
                "id": raw["id"],
                "title": raw.get("title") or raw["id"],
                "description": raw.get("description", ""),
                "source": raw.get("source", ""),
                "source_url": raw.get("source_url", ""),
                "category": raw.get("category", ""),
                "tier": raw.get("tier", ""),
                "tags": raw.get("tags", []),
                "features": raw.get("features", []),
                "featured_level": raw.get("featured_level", ""),
                "featured_order": raw.get("featured_order", 0),
                "featured_reason": raw.get("featured_reason", ""),
                "plugins": raw.get("plugins", []),
                "expect": raw.get("expect", {}),
            }
        )
    return {"examples": items, "total": len(items)}


@app.get("/api/examples/{example_id}")
def get_example(example_id: str) -> dict[str, Any]:
    data = load_manifest()
    for raw in data.get("examples", []):
        if not isinstance(raw, dict) or raw.get("id") != example_id:
            continue
        entry = dict(raw)
        try:
            entry["figure"] = resolve_figure(raw)
        except OSError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return entry
    raise HTTPException(status_code=404, detail=f"Example not found: {example_id}")
