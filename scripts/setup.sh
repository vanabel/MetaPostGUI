#!/usr/bin/env bash
# MetaPostGUI — 一键安装（Python venv + pnpm）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/setup-python.sh"
"$ROOT/scripts/setup-web.sh"
echo ""
echo "安装完成。运行开发环境: ./scripts/dev.sh"
