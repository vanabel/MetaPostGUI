"""Tests for TeX / MetaPost path discovery."""

from __future__ import annotations

import json
import os
import platform
from pathlib import Path

import pytest

from tex_paths import (
    candidate_tex_bin_dirs,
    load_manual_tex_bin,
    normalize_tex_bin,
    resolve_tex_toolchain,
    save_manual_tex_bin,
)


def _touch_mpost(bin_dir: Path) -> Path:
    bin_dir.mkdir(parents=True, exist_ok=True)
    name = "mpost.exe" if platform.system() == "Windows" else "mpost"
    exe = bin_dir / name
    exe.write_text("#!/bin/sh\necho mpost\n", encoding="utf-8")
    if not platform.system() == "Windows":
        exe.chmod(0o755)
    return exe


def test_normalize_tex_bin_accepts_directory(tmp_path: Path) -> None:
    _touch_mpost(tmp_path)
    assert normalize_tex_bin(str(tmp_path)) == tmp_path.resolve()


def test_normalize_tex_bin_accepts_mpost_executable(tmp_path: Path) -> None:
    exe = _touch_mpost(tmp_path)
    assert normalize_tex_bin(str(exe)) == tmp_path.resolve()


def test_manual_override_persists(tmp_path: Path) -> None:
    _touch_mpost(tmp_path)
    save_manual_tex_bin(tmp_path, str(tmp_path))
    assert load_manual_tex_bin(tmp_path) == str(tmp_path)
    info = resolve_tex_toolchain(tmp_path)
    assert info.ok
    assert info.source == "manual"
    assert info.mpost is not None


def test_clear_manual_override(tmp_path: Path) -> None:
    _touch_mpost(tmp_path)
    save_manual_tex_bin(tmp_path, str(tmp_path))
    save_manual_tex_bin(tmp_path, None)
    assert load_manual_tex_bin(tmp_path) is None


def test_invalid_manual_returns_hint(tmp_path: Path) -> None:
    config = tmp_path / "cfg"
    config.mkdir()
    save_manual_tex_bin(config, str(tmp_path / "missing"))
    info = resolve_tex_toolchain(config, manual_override=str(tmp_path / "missing"))
    assert not info.ok
    assert "无效" in info.hint or "mpost" in info.hint


def test_env_metapostgui_tex_bin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _touch_mpost(tmp_path)
    monkeypatch.setenv("METAPOSTGUI_TEX_BIN", str(tmp_path))
    info = resolve_tex_toolchain(tmp_path / "empty-config")
    assert info.ok
    assert info.source == "env"
    assert info.tex_bin == str(tmp_path.resolve())


def test_candidate_dirs_on_darwin_include_known_roots(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("METAPOSTGUI_TEX_BIN", raising=False)
    monkeypatch.delenv("TEXBIN", raising=False)
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    dirs = [str(p) for p in candidate_tex_bin_dirs()]
    assert any(
        "texbin" in d or "texlive" in d.lower() or "tinytex" in d.lower() for d in dirs
    )
