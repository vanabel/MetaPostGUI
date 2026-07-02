"""Wrap figure code and invoke the local mpost binary."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from figure_sanitize import sanitize_figure
from mpost_parser import normalize_mposttex_for_standalone
from tex_paths import build_tex_env, find_mpost

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


@dataclass
class CompileResult:
    ok: bool
    svg: str | None
    log: str
    mp_source: str
    output_path: str | None


def build_mp_source(
    figure: str,
    mpostdef: str = "",
    mposttex: str = "",
    fig_num: int = 1,
    output_format: str = "svg",
) -> str:
    macros = mpostdef.strip()
    latex_inner = normalize_mposttex_for_standalone(mposttex) if mposttex.strip() else ""

    if latex_inner:
        doc_open = "\\begin{document}\n"
        doc_close = "\n\\end{document}"
    else:
        doc_open = ""
        doc_close = ""

    parts = [
        "prologues := 3;",
        f'outputformat := "{output_format}";',
        'outputtemplate := "%j-%c.%{outputformat}";',
        "",
    ]
    if macros:
        parts.extend([macros, ""])
    if latex_inner or doc_open:
        parts.extend(
            [
                "verbatimtex",
                "\\documentclass{article}",
                latex_inner,
                doc_open.rstrip("\n"),
                "etex",
                "",
            ]
        )

    parts.extend(
        [
            f"beginfig({fig_num});",
            sanitize_figure(figure.strip()),
            "endfig;",
            "",
        ]
    )

    if latex_inner or doc_close:
        parts.extend(["verbatimtex", doc_close.strip(), "etex", ""])

    parts.append("end.")
    return "\n".join(parts)


def compile_figure(
    figure: str,
    mpostdef: str = "",
    mposttex: str = "",
    fig_num: int = 1,
    work_dir: Path | None = None,
) -> CompileResult:
    mp_source = build_mp_source(figure, mpostdef, mposttex, fig_num)
    mpost = find_mpost(CONFIG_DIR)

    cleanup = work_dir is None
    if work_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="metapostgui-"))
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    mp_file = work_dir / "figure.mp"
    mp_file.write_text(mp_source, encoding="utf-8")

    env = build_tex_env(CONFIG_DIR)

    try:
        proc = subprocess.run(
            [mpost, "-interaction=nonstopmode", "-tex=latex", str(mp_file.name)],
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
        )
        log = (proc.stdout or "") + (proc.stderr or "")
        mpxerr = work_dir / "mpxerr.log"
        if mpxerr.is_file():
            log += "\n\n--- mpxerr.log ---\n"
            log += mpxerr.read_text(encoding="utf-8", errors="replace")

        svg_path = work_dir / f"figure-{fig_num}.svg"
        if not svg_path.is_file():
            # MetaPost 2.x may emit figure1.svg without dash
            alt = work_dir / f"figure{fig_num}.svg"
            svg_path = alt if alt.is_file() else svg_path

        if proc.returncode != 0 or not svg_path.is_file():
            return CompileResult(
                ok=False,
                svg=None,
                log=log,
                mp_source=mp_source,
                output_path=None,
            )

        svg = svg_path.read_text(encoding="utf-8", errors="replace")
        return CompileResult(
            ok=True,
            svg=svg,
            log=log,
            mp_source=mp_source,
            output_path=str(svg_path),
        )
    finally:
        if cleanup:
            shutil.rmtree(work_dir, ignore_errors=True)


def build_mpostfig_snippet(
    figure: str,
    label: str = "fig-1",
    *,
    show: bool = True,
) -> str:
    opts = f"label={label}"
    if show:
        opts += ",show"
    lines = [
        f"\\begin{{mpostfig}}[{opts}]",
        figure.strip(),
        "\\end{mpostfig}",
    ]
    return "\n".join(lines)


def _wrap_mpostdef_block(body: str) -> str:
    body = body.strip()
    if not body:
        return ""
    if r"\begin{mpostdef}" in body:
        return body
    return f"\\begin{{mpostdef}}\n{body}\n\\end{{mpostdef}}"


def _wrap_mposttex_block(body: str) -> str:
    body = body.strip()
    if not body:
        return ""
    if r"\begin{mposttex}" in body:
        return body
    return f"\\begin{{mposttex}}\n{body}\n\\end{{mposttex}}"


def build_mpostinl_export(
    figure: str,
    label: str = "fig-1",
    mpostdef: str = "",
    mposttex: str = "",
    mpostdef_path: str = "metapost/mpost-def.tex",
    mposttex_path: str = "metapost/mpost-tex.tex",
    show: bool = True,
    mpostinl_options: str = "final,twice,latex",
) -> dict[str, str]:
    """生成完整可编译的 mpostinl .tex，以及可单独粘贴的 mpostfig 片段。"""
    figure_snippet = build_mpostfig_snippet(figure, label, show=show)
    mpostdef_block = _wrap_mpostdef_block(mpostdef)
    mposttex_block = _wrap_mposttex_block(mposttex)

    lines = [
        "% MetaPostGUI export — 完整可编译的 mpostinl 文档",
        f"% 并入既有项目时，可改为 \\input{{{mposttex_path}}} 与 \\input{{{mpostdef_path}}}，",
        "% 并仅复制 figure_snippet（\\begin{mpostfig}…\\end{mpostfig} 段）。",
        "",
        "\\documentclass{article}",
        f"\\usepackage[{mpostinl_options}]{{mpostinl}}",
    ]
    if mposttex_block:
        lines.extend(["", mposttex_block])
    if mpostdef_block:
        lines.extend(["", mpostdef_block])
    lines.extend(
        [
            "",
            "\\begin{document}",
            "",
            figure_snippet,
            "",
            "\\end{document}",
            "",
        ]
    )
    return {
        "filename": f"{label}.tex",
        "content": "\n".join(lines),
        "figure_snippet": figure_snippet + "\n",
    }
