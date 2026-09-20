#!/usr/bin/env bash
# One command to make `forge test` and `npm run hardhat:compile` work from a fresh clone.
# OpenZeppelin 5.6.1 and Hardhat 2.29.1 come from npm (package-lock.json pins them).
# forge-std comes from GitHub at a pinned tag, cloned into lib/ without a git submodule,
# because this package lives inside a larger repository whose root must stay untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
FORGE_STD_TAG="v1.16.2"

command -v forge >/dev/null || { echo "forge not found; install Foundry from https://getfoundry.sh"; exit 1; }
command -v npm >/dev/null || { echo "npm not found; install Node 20 or newer"; exit 1; }

npm ci --no-audit --no-fund

if [ ! -f lib/forge-std/src/Test.sol ]; then
  forge install "foundry-rs/forge-std@${FORGE_STD_TAG}" --no-git
fi
echo "forge-std $(grep -m1 '"version"' lib/forge-std/package.json | tr -dc '0-9.')"
echo "openzeppelin $(grep -m1 '"version"' node_modules/@openzeppelin/contracts/package.json | tr -dc '0-9.')"
forge --version | head -1
