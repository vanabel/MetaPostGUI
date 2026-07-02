#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"
if [[ ! -d .venv ]]; then
  echo "Run ./scripts/setup-python.sh first" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pytest test_examples_compile.py -v "$@"
