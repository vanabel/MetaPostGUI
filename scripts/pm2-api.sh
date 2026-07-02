#!/usr/bin/env bash
# PM2 入口：启动 FastAPI / uvicorn（仅 METAPOSTGUI_API_HOST，默认 127.0.0.1）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$ROOT/server/.venv" ]]; then
  echo "缺少 server/.venv，请先运行 ./scripts/setup-python.sh" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.metapostgui/ports.env" ]]; then
  METAPOSTGUI_RESOLVE_WEB=0 "$ROOT/scripts/resolve-ports.sh"
fi
# shellcheck disable=SC1091
source "$ROOT/.metapostgui/ports.env"
export METAPOSTGUI_API_HOST METAPOSTGUI_API_PORT METAPOSTGUI_WEB_HOST METAPOSTGUI_WEB_PORT

# shellcheck disable=SC1091
source "$ROOT/server/.venv/bin/activate"
cd "$ROOT/server"

HOST="${METAPOSTGUI_API_HOST:-127.0.0.1}"
PORT="${METAPOSTGUI_API_PORT:-18765}"
ARGS=(main:app --host "$HOST" --port "$PORT")

if [[ "${METAPOSTGUI_RELOAD:-0}" == "1" ]]; then
  ARGS+=(--reload)
fi

exec uvicorn "${ARGS[@]}"
