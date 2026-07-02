"""Tests for mpost log diagnostics."""

from __future__ import annotations

from compiler import build_mp_source
from mpost_diagnostics import figure_body_lines, parse_mpost_diagnostics


def test_figure_body_line_range() -> None:
    src = build_mp_source("draw ((0,0)--(1,1));", "u=10pt;", "")
    start, end = figure_body_lines(src)
    lines = src.splitlines()
    assert lines[start - 1].strip().startswith("draw")
    assert "beginfig" in lines[start - 2]


def test_parse_isolated_expression_line() -> None:
    figure = "drawgrid(5;\ndraw ((0,0)--(1,1));"
    src = build_mp_source(figure, "u=10pt;", "")
    log = """! Isolated expression.
l.8 drawgrid(
             5;
"""
    diags = parse_mpost_diagnostics(log, src)
    assert len(diags) >= 1
    assert diags[0]["line"] == 1
    assert "Isolated" in diags[0]["message"]
