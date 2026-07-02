#!/usr/bin/env bash
# 解析可用端口，写入 .metapostgui/ports.env（供 API、Vite、PM2 共用）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.metapostgui"
PORTS_FILE="$RUNTIME_DIR/ports.env"

# shellcheck disable=SC1091
source "$ROOT/scripts/load-env.sh"

if [[ "${METAPOSTGUI_PORTS_LOCKED:-0}" == "1" && -f "$PORTS_FILE" ]]; then
  exit 0
fi

TRIES="${METAPOSTGUI_PORT_TRIES:-20}"
RESOLVE_WEB="${METAPOSTGUI_RESOLVE_WEB:-1}"
RESOLVE_API="${METAPOSTGUI_RESOLVE_API:-1}"

# API 仅本机回环，不对外暴露
API_HOST="127.0.0.1"
if [[ "${METAPOSTGUI_API_HOST:-127.0.0.1}" != "127.0.0.1" ]]; then
  echo "警告：METAPOSTGUI_API_HOST 已设为 ${METAPOSTGUI_API_HOST}；建议保持 127.0.0.1，由前端反代 /api。" >&2
  API_HOST="${METAPOSTGUI_API_HOST}"
fi

API_START="${METAPOSTGUI_API_PORT:-18765}"
WEB_START="${METAPOSTGUI_WEB_PORT:-5173}"
WEB_HOST="${METAPOSTGUI_WEB_HOST:-127.0.0.1}"

if [[ -f "$PORTS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PORTS_FILE"
  API_START="${METAPOSTGUI_API_PORT:-$API_START}"
  WEB_START="${METAPOSTGUI_WEB_PORT:-$WEB_START}"
  WEB_HOST="${METAPOSTGUI_WEB_HOST:-$WEB_HOST}"
  API_HOST="${METAPOSTGUI_API_HOST:-$API_HOST}"
fi

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":${port} "
    return
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null
}

api_health_ok() {
  local port="$1"
  command -v curl >/dev/null 2>&1 || return 1
  curl -sf --max-time 1 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1
}

find_free_port() {
  local start="$1"
  local label="$2"
  local port="$start"
  local i=0
  while (( i < TRIES )); do
    if ! port_in_use "$port"; then
      if [[ "$port" != "$start" ]]; then
        echo "→ ${label} 端口 ${start} 已占用，改用 ${port}" >&2
      fi
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    i=$((i + 1))
  done
  echo "错误：${TRIES} 次内未找到可用 ${label} 端口（起始于 ${start}）" >&2
  return 1
}

find_api_port() {
  local start="$1"
  if port_in_use "$start" && api_health_ok "$start"; then
    echo "→ API 已在 ${start} 运行（MetaPostGUI），复用该端口" >&2
    echo "$start"
    return 0
  fi
  find_free_port "$start" "API"
}

if [[ "$RESOLVE_API" == "1" ]]; then
  API_PORT="$(find_api_port "$API_START")"
else
  API_PORT="$API_START"
fi

if [[ "$RESOLVE_WEB" == "1" ]]; then
  WEB_PORT="$(find_free_port "$WEB_START" "前端")"
else
  WEB_PORT="$WEB_START"
fi

mkdir -p "$RUNTIME_DIR"
cat >"$PORTS_FILE" <<EOF
METAPOSTGUI_API_HOST=${API_HOST}
METAPOSTGUI_API_PORT=${API_PORT}
METAPOSTGUI_WEB_HOST=${WEB_HOST}
METAPOSTGUI_WEB_PORT=${WEB_PORT}
EOF
