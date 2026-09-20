#!/usr/bin/env bash
# Slither over src/ only; tests, scripts, forge-std, receptor-mock and OpenZeppelin are excluded.
# Writes reports/slither.md by hand after triage and reports/slither.json from the tool.
set -uo pipefail
cd "$(dirname "$0")/.."
command -v slither >/dev/null || { echo "slither not found: pip install slither-analyzer"; exit 1; }
mkdir -p reports
slither . --filter-paths "lib/|node_modules/|test/|script/" --json reports/slither.json > /dev/null 2> reports/slither.raw.txt
echo "slither exit $?; raw output in reports/slither.raw.txt"
