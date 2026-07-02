#!/usr/bin/env bash
# MetaPostGUI — 启动本地 mpost 服务 + Vite 前端
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 确保依赖已安装
if [[ ! -d "$ROOT/server/.venv" ]]; then
  "$ROOT/scripts/setup-python.sh"
fi
if [[ ! -d "$ROOT/web/node_modules" ]]; then
  "$ROOT/scripts/setup-web.sh"
fi

"$ROOT/scripts/resolve-ports.sh"
# shellcheck disable=SC1091
source "$ROOT/.metapostgui/ports.env"
export METAPOSTGUI_API_HOST METAPOSTGUI_API_PORT METAPOSTGUI_WEB_HOST METAPOSTGUI_WEB_PORT

# shellcheck disable=SC1091
source "$ROOT/server/.venv/bin/activate"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "→ 启动 mpost 服务 http://${METAPOSTGUI_API_HOST}:${METAPOSTGUI_API_PORT}（仅本机）"
cd "$ROOT/server"
uvicorn main:app --host "$METAPOSTGUI_API_HOST" --port "$METAPOSTGUI_API_PORT" --reload &
SERVER_PID=$!

sleep 1
echo "→ 启动前端 http://${METAPOSTGUI_WEB_HOST}:${METAPOSTGUI_WEB_PORT}"
cd "$ROOT/web"
export METAPOSTGUI_PORTS_LOCKED=1
exec pnpm dev
