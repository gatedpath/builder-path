#!/usr/bin/env bash
# The first version of each package, from the owner's machine, under her own npm login and 2FA.
# Needed once: npm only lets a trusted publisher be added to a package that already exists. Every
# later version comes from .github/workflows/publish.yml. No token is created or read here.
#
#   bash scripts/publish/first-publish.sh            dry run: packs and lists, publishes nothing
#   bash scripts/publish/first-publish.sh --publish  the real thing; npm asks for 2FA per package
#
# Order is the dependency order. A package already on the registry at this version is skipped, so
# the script can be re-run after an interruption. package.json is put back from a saved copy, even
# on failure, so uncommitted work in it (a version bump) survives a dry run.
#
# Before anything is published, each package's tarball is installed in an empty folder against the
# registry, and the scaffolder is run from it. Listing a tarball's files is not a test: 0.1.0 of the
# scaffolder passed every test in the repository and failed on its first install from npm.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"

MODE="--dry-run"; [ "${1:-}" = "--publish" ] && MODE=""
PACKAGES=(chain-definitions agent-rules preflight frontend-kit mcp ops-kit receptor-mock contract-kit create-redbelly-dapp)

if ! WHO="$(npm whoami 2>/dev/null)"; then
  # A dry run publishes nothing, so it does not need a login; the real thing does.
  [ -z "$MODE" ] && { echo "Not logged in. Run: npm login"; exit 1; }
  WHO="(not logged in; a dry run does not need it)"
fi
echo "npm account: $WHO    mode: ${MODE:-REAL PUBLISH}"
if [ -z "$MODE" ]; then
  [ -z "$(git status --porcelain -- packages)" ] || { echo "packages/ has uncommitted changes; commit first."; exit 1; }
  read -r -p "This publishes 9 public packages permanently. Type PUBLISH to continue: " ok
  [ "$ok" = "PUBLISH" ] || { echo "Stopped. Nothing published."; exit 1; }
fi

for dir in "${PACKAGES[@]}"; do
  pkg="packages/$dir"
  name="$(node -p "require('./$pkg/package.json').name")"
  version="$(node -p "require('./$pkg/package.json').version")"
  echo; echo "== $name@$version"
  if [ "$(npm view "$name@$version" version 2>/dev/null)" = "$version" ]; then echo "already on npm, skipped"; continue; fi
  (
    cd "$pkg"
    saved="$(mktemp)"; cp package.json "$saved"
    smoke="$(mktemp -d)"
    trap 'cp "$saved" package.json; rm -rf "$saved" "$smoke"' EXIT
    [ -f package-lock.json ] && npm ci --silent
    [ -f scripts/setup.sh ] && bash scripts/setup.sh >/dev/null
    node ../../scripts/publish/prepare.mjs .

    # Smoke test the exact tarball. Siblings must already be on the registry, which the order ensures.
    npm pack --silent --pack-destination "$smoke" >/dev/null
    # The registry can take a few seconds to serve a sibling published a moment ago, so try a few times.
    installed=""
    ( cd "$smoke" && npm init -y >/dev/null )
    # npm says a new version "may take a few minutes to become available"; on 19 September 2026 forty
    # seconds was not enough, and the run stopped (safely) at the third package.
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
      if ( cd "$smoke" && npm install --silent ./*.tgz >/dev/null 2>&1 ); then installed=yes; break; fi
      [ -n "$MODE" ] && break   # a dry run does not wait: see below
      echo "smoke: a sibling is not on the registry yet (attempt $attempt of 12); waiting 15 s"; sleep 15
    done
    if [ -z "$installed" ]; then
      if [ -n "$MODE" ]; then
        # Expected in a dry run whenever this package depends on a sibling whose new version is not on
        # npm yet. The all-tarballs test (packages/create-redbelly-dapp/reports/) covers that case.
        echo "smoke: not run in this dry run; a sibling at this version is not on npm yet"
        npm publish --access public $MODE; exit 0
      fi
      echo "SMOKE TEST FAILED: $name does not install from its tarball. Nothing published."; exit 1
    fi
    if [ "$name" = "create-redbelly-dapp" ]; then
      ( cd "$smoke" && ./node_modules/.bin/create-redbelly-dapp smoke-app --yes >/dev/null ) \
        || { echo "SMOKE TEST FAILED: the scaffolder does not run from its tarball. Nothing published."; exit 1; }
      # `npm run doctor` on the bare scaffold, before any install: 0.1.1 crashed here with
      # ERR_MODULE_NOT_FOUND, because its vendored packages only linked to each other inside the repository.
      ( cd "$smoke/smoke-app" && npm run doctor 2>&1 | grep -q "ERR_MODULE_NOT_FOUND" ) \
        && { echo "SMOKE TEST FAILED: npm run doctor cannot find a vendored package on a bare scaffold. Nothing published."; exit 1; }
      echo "smoke: installed from the tarball, scaffolded a project, and doctor runs on it bare"
    else
      echo "smoke: installed from the tarball"
    fi

    npm publish --access public $MODE
  )
done
echo; echo "Done. ${MODE:+Dry run only: nothing was published.}"
