#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== web vitest =="
(cd "$ROOT/web" && pnpm test)

echo "== server pytest (unit + examples) =="
(cd "$ROOT/server" && source .venv/bin/activate && pytest -v)

echo "== examples compile report =="
cd "$ROOT/server"
# shellcheck disable=SC1091
source .venv/bin/activate
python -c "from test_examples_compile import run_compile_report; r=run_compile_report(); print(f\"compile: {r['passed']}/{r['total']} passed in {r['elapsed_sec']}s\")"

echo "== docs & macro report =="
python3 "$ROOT/scripts/generate-examples-doc.py"
python3 "$ROOT/scripts/analyze-macros.py"

echo "All tests done."
