#!/usr/bin/env bash
# One command to make `forge test` work from a fresh clone. OpenZeppelin 5.6.1 comes from npm
# (package-lock.json pins it); forge-std is cloned at a pinned tag with `forge install --no-git`,
# because a submodule would write `.gitmodules` at the root of the work record; receptor-mock is
# the sibling package, linked into lib/ so there is one copy of Gated and GatedTest in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
FORGE_STD_TAG="v1.16.2"

command -v forge >/dev/null || { echo "forge not found; install Foundry from https://getfoundry.sh"; exit 1; }
command -v npm >/dev/null || { echo "npm not found; install Node 20 or newer"; exit 1; }

npm ci --no-audit --no-fund
mkdir -p lib

if [ ! -f lib/forge-std/src/Test.sol ]; then
  forge install "foundry-rs/forge-std@${FORGE_STD_TAG}" --no-git
fi

if [ ! -e lib/receptor-mock ]; then
  if [ -d ../receptor-mock/src ]; then
    ln -s ../../receptor-mock lib/receptor-mock
  else
    echo "packages/receptor-mock not found beside this package; clone the whole repository"; exit 1
  fi
fi

echo "forge-std $(grep -m1 '"version"' lib/forge-std/package.json | tr -dc '0-9.')"
echo "openzeppelin $(grep -m1 '"version"' node_modules/@openzeppelin/contracts/package.json | tr -dc '0-9.')"
echo "receptor-mock -> $(readlink lib/receptor-mock)"
forge --version | head -1
