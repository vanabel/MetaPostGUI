#!/usr/bin/env bash
# Docker entrypoint: run the local API and Vite preview in one container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

export METAPOSTGUI_API_HOST="${METAPOSTGUI_API_HOST:-127.0.0.1}"
export METAPOSTGUI_API_PORT="${METAPOSTGUI_API_PORT:-18765}"
export METAPOSTGUI_WEB_HOST="${METAPOSTGUI_WEB_HOST:-0.0.0.0}"
export METAPOSTGUI_WEB_PORT="${METAPOSTGUI_WEB_PORT:-18080}"
export METAPOSTGUI_PORT_TRIES="${METAPOSTGUI_PORT_TRIES:-1}"

"$ROOT/scripts/resolve-ports.sh"
# shellcheck disable=SC1091
source "$ROOT/.metapostgui/ports.env"
export METAPOSTGUI_API_HOST METAPOSTGUI_API_PORT METAPOSTGUI_WEB_HOST METAPOSTGUI_WEB_PORT

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting MetaPostGUI API on ${METAPOSTGUI_API_HOST}:${METAPOSTGUI_API_PORT}"
(
  cd "$ROOT/server"
  # shellcheck disable=SC1091
  source "$ROOT/server/.venv/bin/activate"
  exec uvicorn main:app --host "$METAPOSTGUI_API_HOST" --port "$METAPOSTGUI_API_PORT"
) &
API_PID="$!"

echo "Starting MetaPostGUI web preview on ${METAPOSTGUI_WEB_HOST}:${METAPOSTGUI_WEB_PORT}"
cd "$ROOT/web"
exec pnpm exec vite preview --host "$METAPOSTGUI_WEB_HOST" --port "$METAPOSTGUI_WEB_PORT"
