#!/usr/bin/env bash
# Aderyn over src/. Writes reports/aderyn.md. Install: https://github.com/Cyfrin/aderyn (cyfrinup).
set -uo pipefail
cd "$(dirname "$0")/.."
command -v aderyn >/dev/null || { echo "aderyn not found"; exit 1; }
mkdir -p reports
aderyn . --src src/ -o reports/aderyn.md
echo "aderyn exit $?"
