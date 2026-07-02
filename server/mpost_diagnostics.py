"""Map MetaPost compile logs to figure-editor line diagnostics."""

from __future__ import annotations

import re
from typing import Any

_LINE_RE = re.compile(r"^l\.(\d+)\s", re.MULTILINE)
_ERROR_RE = re.compile(r"^!\s*(.+)$", re.MULTILINE)


def figure_body_lines(mp_source: str, fig_num: int = 1) -> tuple[int, int]:
    """Return 1-based inclusive line range of figure body inside beginfig/endfig."""
    lines = mp_source.splitlines()
    start = 1
    end = len(lines) or 1
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith(f"beginfig({fig_num})"):
            start = i + 1
            break
    for i in range(start, len(lines) + 1):
        if lines[i - 1].strip().startswith("endfig"):
            end = max(start, i - 1)
            break
    return start, end


def parse_mpost_diagnostics(
    log: str,
    mp_source: str,
    *,
    fig_num: int = 1,
) -> list[dict[str, Any]]:
    """Parse mpost log; lines are relative to figure editor (1-based)."""
    if not log.strip():
        return []

    fig_start, fig_end = figure_body_lines(mp_source, fig_num)
    diagnostics: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()

    errors = list(_ERROR_RE.finditer(log))
    line_matches = list(_LINE_RE.finditer(log))

    for idx, err in enumerate(errors):
        message = err.group(1).strip()
        mp_line: int | None = None
        err_pos = err.start()
        for lm in line_matches:
            if lm.start() > err_pos:
                mp_line = int(lm.group(1))
                break
        if mp_line is None and line_matches:
            mp_line = int(line_matches[min(idx, len(line_matches) - 1)].group(1))

        if mp_line is not None and fig_start <= mp_line <= fig_end:
            fig_line = mp_line - fig_start + 1
        elif mp_line is not None:
            continue
        else:
            fig_line = 1

        key = (fig_line, message)
        if key in seen:
            continue
        seen.add(key)
        diagnostics.append(
            {
                "line": fig_line,
                "column": None,
                "message": message,
                "severity": "error",
            }
        )

    if not diagnostics and ("!" in log or "error" in log.lower()):
        if "No output written" in log or "!" in log:
            diagnostics.append(
                {
                    "line": 1,
                    "column": None,
                    "message": "MetaPost 编译失败，详见编译日志",
                    "severity": "error",
                }
            )

    return diagnostics
