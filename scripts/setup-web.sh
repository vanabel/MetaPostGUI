#!/usr/bin/env bash
# MetaPostGUI — pnpm 安装前端依赖
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误: 未找到 pnpm。请先安装: npm install -g pnpm"
  exit 1
fi

pnpm install
# Vite 依赖 esbuild 原生构建；pnpm 10+ 默认拦截 build scripts
pnpm approve-builds esbuild 2>/dev/null || true
pnpm rebuild esbuild 2>/dev/null || true
echo "✓ 前端依赖已安装（web/node_modules）"
