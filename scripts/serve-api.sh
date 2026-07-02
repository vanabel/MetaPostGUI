#!/usr/bin/env bash
# 仅启动 Python mpost 服务（供调试）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
METAPOSTGUI_RESOLVE_WEB=0 "$ROOT/scripts/resolve-ports.sh"
# shellcheck disable=SC1091
source "$ROOT/.metapostgui/ports.env"
export METAPOSTGUI_API_HOST METAPOSTGUI_API_PORT METAPOSTGUI_WEB_PORT
# shellcheck disable=SC1091
source "$ROOT/server/.venv/bin/activate"
cd "$ROOT/server"
exec uvicorn main:app --host "$METAPOSTGUI_API_HOST" --port "$METAPOSTGUI_API_PORT" --reload
