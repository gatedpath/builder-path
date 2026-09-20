#!/usr/bin/env bash
# Slither over src/ only; tests, forge-std and OpenZeppelin are excluded. Writes reports/slither.md
# (human output) and reports/slither.json (machine output). Exit code is not used as a gate here;
# every finding is triaged by hand in reports/slither.md.
set -uo pipefail
cd "$(dirname "$0")/.."
command -v slither >/dev/null || { echo "slither not found: pip install slither-analyzer"; exit 1; }
mkdir -p reports
slither . --filter-paths "lib/|node_modules/|test/" --json reports/slither.json > /dev/null 2> reports/slither.raw.txt
echo "slither exit $?; raw output in reports/slither.raw.txt"
