#!/usr/bin/env bash
# MetaPostGUI — 用 PM2 管理 API + 前端
#
# 用法：
#   ./scripts/pm2.sh start dev          # 开发：uvicorn --reload + vite dev
#   ./scripts/pm2.sh start prod         # 生产：uvicorn + vite preview（需 web/dist）
#   ./scripts/pm2.sh start prod-api     # 仅 API（配合 Nginx 静态站点）
#   ./scripts/pm2.sh stop | restart | status | logs [api|web]
#   ./scripts/pm2.sh save               # 保存进程列表（开机自启前执行）
#
# 依赖：npm install -g pm2
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECOSYSTEM="$ROOT/ecosystem.config.cjs"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "未找到 pm2。安装：npm install -g pm2" >&2
  exit 1
fi

ensure_deps() {
  [[ -d "$ROOT/server/.venv" ]] || "$ROOT/scripts/setup-python.sh"
  [[ -d "$ROOT/web/node_modules" ]] || "$ROOT/scripts/setup-web.sh"
}

pm2_env() {
  case "${1:-dev}" in
    dev) echo "development" ;;
    prod | prod-api) echo "production" ;;
    *)
      echo "未知环境：$1（可用 dev | prod | prod-api）" >&2
      exit 1
      ;;
  esac
}

start_apps() {
  local mode="${1:-dev}"
  local pm2_mode
  pm2_mode="$(pm2_env "$mode")"

  ensure_deps

  # shellcheck disable=SC1091
  source "$ROOT/scripts/load-env.sh"
  case "$mode" in
    prod)
      if [[ -z "${METAPOSTGUI_WEB_HOST:-}" || "${METAPOSTGUI_WEB_HOST}" == "127.0.0.1" || "${METAPOSTGUI_WEB_HOST}" == "localhost" ]]; then
        export METAPOSTGUI_WEB_HOST="0.0.0.0"
      fi
      METAPOSTGUI_RESOLVE_WEB=1 "$ROOT/scripts/resolve-ports.sh"
      ;;
    prod-api)
      METAPOSTGUI_RESOLVE_WEB=0 "$ROOT/scripts/resolve-ports.sh"
      ;;
    *)
      "$ROOT/scripts/resolve-ports.sh"
      ;;
  esac
  # shellcheck disable=SC1091
  source "$ROOT/.metapostgui/ports.env"
  export METAPOSTGUI_API_HOST METAPOSTGUI_API_PORT METAPOSTGUI_WEB_HOST METAPOSTGUI_WEB_PORT

  if [[ "$mode" == "prod" ]] && [[ ! -d "$ROOT/web/dist" ]]; then
    echo "→ 构建前端 web/dist …"
    (cd "$ROOT/web" && pnpm build)
  fi

  if [[ "$mode" == "prod-api" ]]; then
    pm2 start "$ECOSYSTEM" --only metapostgui-api --env "$pm2_mode" --update-env
  else
    pm2 start "$ECOSYSTEM" --env "$pm2_mode" --update-env
  fi

  pm2 status
  echo ""
  if [[ "$mode" == "prod-api" ]]; then
    echo "API：http://${METAPOSTGUI_API_HOST}:${METAPOSTGUI_API_PORT}（仅本机，请用 Nginx 反代 /api）"
  elif [[ "$mode" == "prod" ]]; then
    echo "访问：http://<主机>:${METAPOSTGUI_WEB_PORT}（仅开放前端；/api 反代到本机 ${METAPOSTGUI_API_PORT}）"
  else
    echo "访问：http://localhost:${METAPOSTGUI_WEB_PORT}"
    echo "API：http://${METAPOSTGUI_API_HOST}:${METAPOSTGUI_API_PORT}（仅本机，由 Vite 反代 /api）"
  fi
}

ACTION="${1:-}"
MODE="${2:-dev}"

case "$ACTION" in
  start)
    start_apps "$MODE"
    ;;
  stop)
    pm2 stop metapostgui-api metapostgui-web 2>/dev/null || true
    pm2 delete metapostgui-api metapostgui-web 2>/dev/null || true
    ;;
  restart)
    pm2 restart metapostgui-api metapostgui-web --update-env 2>/dev/null \
      || start_apps "$MODE"
    ;;
  status)
    pm2 status
    ;;
  logs)
    case "${MODE}" in
      api) pm2 logs metapostgui-api ;;
      web) pm2 logs metapostgui-web ;;
      *) pm2 logs ;;
    esac
    ;;
  save)
    pm2 save
    echo "已保存。若需开机自启，另执行：pm2 startup"
    ;;
  "")
    echo "用法: $0 {start|stop|restart|status|logs|save} [dev|prod|prod-api|api|web]" >&2
    exit 1
    ;;
  *)
    echo "未知命令：$ACTION" >&2
    exit 1
    ;;
esac
