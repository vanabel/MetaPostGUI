"""Tests for compiler export helpers."""

from __future__ import annotations

from compiler import build_mpostinl_export
from main import _mpostdef_with_default, defaults


def test_mpostinl_export_full_document_with_plugins() -> None:
    result = build_mpostinl_export(
        figure="drawAxisTick(10, btex $1$ etex);",
        label="fig-demo",
        mpostdef="u=10pt;\n% --- plugin: axis-tick ---\nvardef drawAxisTick(expr len)(text lab) = enddef;",
        mposttex="\\usepackage{amsmath}",
        mpostdef_path="metapost/mpost-def.tex",
        mposttex_path="metapost/mpost-tex.tex",
    )
    content = result["content"]
    snippet = result["figure_snippet"]

    assert "\\documentclass{article}" in content
    assert "\\usepackage[final,twice,latex]{mpostinl}" in content
    assert "\\begin{mposttex}" in content
    assert "\\usepackage{amsmath}" in content
    assert "\\begin{mpostdef}" in content
    assert "drawAxisTick" in content
    assert "\\begin{document}" in content
    assert "\\end{document}" in content
    assert "drawAxisTick(10, btex $1$ etex);" in content

    assert snippet.startswith("\\begin{mpostfig}")
    assert snippet.strip().endswith("\\end{mpostfig}")
    assert "\\documentclass" not in snippet
    assert "drawAxisTick(10, btex $1$ etex);" in snippet


def test_empty_mpostdef_uses_default_coordtwo_macro() -> None:
    mpostdef = _mpostdef_with_default("")
    assert "vardef coordtwo" in mpostdef
    assert defaults()["mpostdef"] == mpostdef
