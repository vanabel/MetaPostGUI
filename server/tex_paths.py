"""Discover TeX / MetaPost binaries on macOS, Linux, and Windows."""

from __future__ import annotations

import json
import os
import platform
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

MANUAL_CONFIG_FILENAME = "user-tex-bin.json"


@dataclass
class TexToolchainInfo:
    ok: bool
    tex_bin: str | None
    mpost: str | None
    latex: str | None
    source: str  # auto | manual | env | path
    platform: str
    manual_tex_bin: str | None = None
    candidates: list[str] = field(default_factory=list)
    hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _is_windows() -> bool:
    return platform.system() == "Windows"


def _exe_name(base: str) -> str:
    return f"{base}.exe" if _is_windows() else base


def _platform_bin_subdirs() -> list[str]:
    system = platform.system()
    if system == "Darwin":
        return ["universal-darwin", "x86_64-darwin", "arm64-darwin", "aarch64-darwin"]
    if system == "Windows":
        return ["windows", "win32"]
    return ["x86_64-linux", "aarch64-linux", "armhf-linux", "i386-linux", "amd64-linux"]


def _path_key(path: Path) -> str:
    return str(path).lower() if _is_windows() else str(path)


def _mpost_in_dir(bin_dir: Path) -> Path | None:
    if not bin_dir.is_dir():
        return None
    direct = bin_dir / _exe_name("mpost")
    if direct.is_file():
        return direct
    return None


def _latex_in_dir(bin_dir: Path) -> Path | None:
    if not bin_dir.is_dir():
        return None
    direct = bin_dir / _exe_name("latex")
    if direct.is_file():
        return direct
    return None


def normalize_tex_bin(path: str) -> Path | None:
    """Return directory containing mpost, or None if invalid."""
    raw = path.strip().strip('"').strip("'")
    if not raw:
        return None
    p = Path(raw).expanduser()
    try:
        p = p.resolve()
    except OSError:
        p = p.expanduser()
    if p.is_file():
        if p.name.lower().startswith("mpost"):
            p = p.parent
        else:
            return None
    if _mpost_in_dir(p):
        return p
    return None


def candidate_tex_bin_dirs() -> list[Path]:
    """Well-known TeX Live / MacTeX / MiKTeX binary directories."""
    candidates: list[Path] = []
    home = Path.home()
    system = platform.system()

    for key in ("METAPOSTGUI_TEX_BIN", "TEXBIN"):
        val = os.environ.get(key, "").strip()
        if val:
            candidates.append(Path(val).expanduser())

    if system == "Darwin":
        candidates.append(Path("/Library/TeX/texbin"))
        for root in (Path("/usr/local/texlive"), Path("/opt/texlive")):
            if root.is_dir():
                candidates.extend(sorted(root.glob("*/bin/*"), reverse=True))
        for sub in _platform_bin_subdirs():
            tiny = home / "Library/TinyTeX/bin" / sub
            if tiny.is_dir():
                candidates.append(tiny)
    elif system == "Windows":
        for env_key in ("LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"):
            base = os.environ.get(env_key, "").strip()
            if not base:
                continue
            root = Path(base)
            for rel in (
                "Programs/MiKTeX/miktex/bin/x64",
                "MiKTeX/miktex/bin/x64",
                "TeX Live/*/bin/windows",
            ):
                candidates.extend(root.glob(rel))
        candidates.append(Path("C:/texlive"))
        for tl in Path("C:/texlive").glob("*/bin/windows"):
            candidates.append(tl)
        for tl in Path("C:/Program Files").glob("MiKTeX*/miktex/bin/*"):
            candidates.append(tl)
    else:
        for root in (
            Path("/usr/local/texlive"),
            Path("/opt/texlive"),
            Path("/usr/share/texlive"),
        ):
            if root.is_dir():
                candidates.extend(sorted(root.glob("*/bin/*"), reverse=True))
        candidates.append(Path("/usr/bin"))

    tl_root = os.environ.get("TEXLIVE_ROOT", "").strip()
    if tl_root:
        root = Path(tl_root).expanduser()
        for sub in _platform_bin_subdirs():
            candidates.append(root / "bin" / sub)

    seen: set[str] = set()
    out: list[Path] = []
    for p in candidates:
        try:
            resolved = p.expanduser().resolve()
        except OSError:
            resolved = p.expanduser()
        key = _path_key(resolved)
        if key in seen:
            continue
        seen.add(key)
        out.append(resolved)
    return out


def _scan_candidates() -> tuple[Path | None, list[str]]:
    found: list[str] = []
    for bin_dir in candidate_tex_bin_dirs():
        found.append(str(bin_dir))
        if _mpost_in_dir(bin_dir):
            return bin_dir, found
    which = shutil.which("mpost")
    if which:
        bin_dir = Path(which).resolve().parent
        if str(bin_dir) not in found:
            found.insert(0, str(bin_dir))
        return bin_dir, found
    return None, found


def _hint_missing(candidates: list[str]) -> str:
    system = platform.system()
    lines = [
        "未找到 mpost。请安装 TeX Live / MacTeX / MiKTeX，或在设置中手动指定 tex bin 目录。",
    ]
    if system == "Darwin":
        lines.append("macOS 常见路径：/Library/TeX/texbin")
    elif system == "Windows":
        lines.append("Windows 常见路径：C:\\texlive\\2024\\bin\\windows 或 MiKTeX 的 miktex\\bin\\x64")
    else:
        lines.append("Linux 常见路径：/usr/local/texlive/YYYY/bin/<arch>")
    lines.append("也可设置环境变量 METAPOSTGUI_TEX_BIN 指向含 mpost 的目录。")
    if candidates:
        lines.append(f"已搜索 {len(candidates)} 个候选路径。")
    return " ".join(lines)


def _hint_missing_latex(tex_bin: str) -> str:
    return (
        f"在 {tex_bin} 未找到 latex。带 btex/etex 或默认中文 mposttex 的图需要 LaTeX；"
        "请安装 texlive-latex-base 或完整 TeX Live。"
    )


def load_manual_tex_bin(config_dir: Path) -> str | None:
    path = config_dir / MANUAL_CONFIG_FILENAME
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        val = (data.get("tex_bin") or "").strip()
        return val or None
    except (json.JSONDecodeError, OSError):
        return None


def save_manual_tex_bin(config_dir: Path, tex_bin: str | None) -> None:
    config_dir.mkdir(parents=True, exist_ok=True)
    path = config_dir / MANUAL_CONFIG_FILENAME
    if not tex_bin or not tex_bin.strip():
        if path.is_file():
            path.unlink()
        return
    path.write_text(
        json.dumps({"tex_bin": tex_bin.strip()}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_tex_toolchain(
    config_dir: Path | None = None,
    manual_override: str | None = None,
) -> TexToolchainInfo:
    """Resolve effective TeX bin directory and tool paths."""
    platform_name = platform.system()
    manual_saved: str | None = None
    if config_dir is not None:
        manual_saved = load_manual_tex_bin(config_dir)
    manual = (manual_override if manual_override is not None else manual_saved) or ""
    manual = manual.strip()

    bin_dir: Path | None = None
    source = "auto"
    candidates: list[str] = []

    if manual:
        normalized = normalize_tex_bin(manual)
        if normalized:
            bin_dir = normalized
            source = "manual"
        else:
            scanned, candidates = _scan_candidates()
            return TexToolchainInfo(
                ok=False,
                tex_bin=None,
                mpost=None,
                latex=None,
                source="manual",
                platform=platform_name,
                manual_tex_bin=manual,
                candidates=candidates,
                hint=f"手动路径无效（目录中需有 mpost）：{manual}",
            )

    if bin_dir is None:
        for key in ("METAPOSTGUI_TEX_BIN", "TEXBIN"):
            val = os.environ.get(key, "").strip()
            if val:
                normalized = normalize_tex_bin(val)
                if normalized:
                    bin_dir = normalized
                    source = "env"
                    break

    if bin_dir is None:
        bin_dir, candidates = _scan_candidates()
        if bin_dir is not None and source == "auto":
            source = "path"

    if bin_dir is None:
        _, candidates = _scan_candidates()
        return TexToolchainInfo(
            ok=False,
            tex_bin=None,
            mpost=None,
            latex=None,
            source=source,
            platform=platform_name,
            manual_tex_bin=manual_saved,
            candidates=candidates,
            hint=_hint_missing(candidates),
        )

    mpost = _mpost_in_dir(bin_dir)
    latex = _latex_in_dir(bin_dir)
    tex_bin_str = str(bin_dir)
    ok = mpost is not None
    hint = ""
    if ok and latex is None:
        hint = _hint_missing_latex(tex_bin_str)

    if not candidates:
        _, candidates = _scan_candidates()

    return TexToolchainInfo(
        ok=ok,
        tex_bin=tex_bin_str,
        mpost=str(mpost) if mpost else None,
        latex=str(latex) if latex else None,
        source=source,
        platform=platform_name,
        manual_tex_bin=manual_saved,
        candidates=candidates,
        hint=hint,
    )


def build_tex_env(config_dir: Path | None = None) -> dict[str, str]:
    """Copy os.environ with TeX bin prepended to PATH."""
    info = resolve_tex_toolchain(config_dir)
    env = os.environ.copy()
    if info.tex_bin:
        sep = ";" if _is_windows() else ":"
        env["PATH"] = f"{info.tex_bin}{sep}{env.get('PATH', '')}"
    return env


def find_mpost(config_dir: Path | None = None) -> str:
    info = resolve_tex_toolchain(config_dir)
    if info.mpost:
        return info.mpost
    raise RuntimeError(info.hint or "mpost not found. Install TeX Live / MacTeX.")
