"""Extract MetaPost / LaTeX fragments from mpostinl-style .tex files."""

from __future__ import annotations

import re

_MPOSTDEF_RE = re.compile(
    r"\\begin\{mpostdef\}(?:\[[^\]]*\])?\s*(.*?)\\end\{mpostdef\}",
    re.DOTALL,
)
_MPOSTTEX_RE = re.compile(
    r"\\begin\{mposttex\}(?:\[[^\]]*\])?\s*(.*?)\\end\{mposttex\}",
    re.DOTALL,
)


def extract_mpostdef(tex: str) -> str:
    blocks = [m.group(1).strip() for m in _MPOSTDEF_RE.finditer(tex)]
    if blocks:
        return "\n\n".join(blocks)
    return tex.strip()


def extract_mposttex(tex: str) -> str:
    blocks = [m.group(1).strip() for m in _MPOSTTEX_RE.finditer(tex)]
    if blocks:
        return "\n\n".join(blocks)
    return tex.strip()


def normalize_mposttex_for_standalone(latex_body: str) -> str:
    """Turn mpostinl mposttex (with \\AtBeginDocument hooks) into verbatimtex preamble."""
    body = latex_body.strip()
    body = re.sub(
        r"\\AtBeginDocument\{\\begin\{CJK\*\}\{UTF8\}\{gkai\}\}",
        r"\\begin{CJK*}{UTF8}{gkai}",
        body,
    )
    body = re.sub(r"\\AtEndDocument\{\\end\{CJK\*\}\}", r"\\end{CJK*}", body)
    return body
