"""Repair common MetaPost modifier mistakes before compile."""

from __future__ import annotations

import re

_DEFAULT_DASHED_PEN = "pencircle scaled 1pt"
_DRAW_PREFIX = re.compile(r"^(draw|filldraw|drawarrow|drawdot)\b", re.IGNORECASE)
_PATH_ASSIGN_NO_SEMI = re.compile(
    r"^([a-zA-Z_]\w*\[\d+\]\s*=\s*.+\bscaled\s+u)\s*$",
    re.IGNORECASE,
)


def _merge_incomplete_draw_statements(figure: str) -> str:
    """Join draw/... paths split across lines until a terminating semicolon."""
    lines = figure.splitlines()
    out: list[str] = []
    buf = ""

    def flush() -> None:
        nonlocal buf
        if buf:
            out.append(buf)
            buf = ""

    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            flush()
            out.append(raw)
            continue
        if stripped.startswith("%"):
            flush()
            out.append(raw)
            continue

        if buf:
            buf = f"{buf} {stripped}"
            if stripped.endswith(";"):
                flush()
            continue

        if _DRAW_PREFIX.match(stripped) and not stripped.endswith(";"):
            buf = stripped
            continue

        out.append(stripped)

    flush()
    return "\n".join(out)


def _ensure_pen_scaled(pen: str) -> str:
    t = pen.strip()
    if not t:
        return _DEFAULT_DASHED_PEN
    if t.lower() == "pencircle":
        return "pencircle scaled 1pt"
    if "scaled" not in t.lower() and t.lower().startswith("pencircle"):
        return f"{t} scaled 1pt"
    return t


def _sanitize_draw_line(line: str) -> str:
    body = line.strip().rstrip(";").strip()
    if not _DRAW_PREFIX.match(body):
        return line.strip()

    m = re.search(r"\bwithpen\s+(.+)$", body, re.IGNORECASE)
    if m:
        pen_part = m.group(1).strip()
        core = body[: m.start()].rstrip()

        if re.match(r"^dashed\b", pen_part, re.IGNORECASE):
            dash = re.sub(r"^dashed\s*", "", pen_part, flags=re.IGNORECASE).strip() or "evenly"
            body = f"{core} withpen {_DEFAULT_DASHED_PEN} dashed {dash}"
        else:
            m2 = re.match(r"^(.*)\s+dashed\s+(.+)$", pen_part, re.IGNORECASE)
            if m2:
                pen = _ensure_pen_scaled(m2.group(1))
                dash = m2.group(2).strip() or "evenly"
                body = f"{core} withpen {pen} dashed {dash}"

    if re.search(r"\bdashed\b", body, re.IGNORECASE) and not re.search(
        r"\bwithpen\b", body, re.IGNORECASE
    ):

        def _add_pen(match: re.Match[str]) -> str:
            return f"dashed {match.group(1).strip()} withpen {_DEFAULT_DASHED_PEN}"

        body = re.sub(r"\bdashed\s+([^;]+)", _add_pen, body, count=1, flags=re.IGNORECASE)

    return body + ";"


def sanitize_figure(figure: str) -> str:
    merged = _merge_incomplete_draw_statements(figure)
    out: list[str] = []
    for line in merged.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("%"):
            out.append(line)
            continue
        if _DRAW_PREFIX.match(stripped):
            out.append(_sanitize_draw_line(stripped))
            continue
        if _PATH_ASSIGN_NO_SEMI.match(stripped):
            out.append(stripped + ";")
            continue
        out.append(line)
    return "\n".join(out)
