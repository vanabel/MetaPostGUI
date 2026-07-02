#!/usr/bin/env bash
# Download thruston utility macros into examples/thruston/ and config/plugins/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="https://raw.githubusercontent.com/thruston/metapost-examples/main"
MACROS=(
  arrow_label
  mark_equal
  markle
  isometric_projection
  thatch
  paintball
)

mkdir -p "$ROOT/examples/thruston"
mkdir -p "$ROOT/config/plugins"

for name in "${MACROS[@]}"; do
  echo "Fetching $name.mp ..."
  curl -fsSL "$BASE/${name}.mp" -o "$ROOT/examples/thruston/${name}.mp"
  cp "$ROOT/examples/thruston/${name}.mp" "$ROOT/config/plugins/${name}.mp"
done

echo "Done. See examples/ATTRIBUTION.md for license."
