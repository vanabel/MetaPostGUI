#!/usr/bin/env bash
# MetaPostGUI — 创建 Python 虚拟环境并安装依赖
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"

if [[ ! -d .venv ]]; then
  echo "→ 创建 Python 虚拟环境 server/.venv"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo "✓ Python 依赖已安装（server/.venv）"
