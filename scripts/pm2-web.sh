#!/usr/bin/env bash
# PM2 入口：Vite 开发服或 preview（生产静态 + /api 反代）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$ROOT/web/node_modules" ]]; then
  echo "缺少 web/node_modules，请先运行 ./scripts/setup-web.sh" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.metapostgui/ports.env" ]]; then
  "$ROOT/scripts/resolve-ports.sh"
fi
# shellcheck disable=SC1091
source "$ROOT/.metapostgui/ports.env"

cd "$ROOT/web"

MODE="${METAPOSTGUI_WEB_MODE:-dev}"
HOST="${METAPOSTGUI_WEB_HOST:-127.0.0.1}"
PORT="${METAPOSTGUI_WEB_PORT:-5173}"

if [[ "$MODE" == "preview" ]]; then
  if [[ ! -d dist ]]; then
    echo "缺少 web/dist，请先运行：cd web && pnpm build" >&2
    exit 1
  fi
  exec pnpm exec vite preview --host "$HOST" --port "$PORT"
fi

exec pnpm exec vite --host "$HOST" --port "$PORT"
