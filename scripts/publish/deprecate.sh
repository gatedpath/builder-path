#!/usr/bin/env bash
# Mark one version of all nine packages as deprecated, with one plain message, so that anyone who
# installs that version is told which version to move to. Deprecating removes nothing: the version
# still installs, npm just prints the message. From the owner's machine, under her own npm login
# and 2FA; no token is created or read here.
#
#   bash scripts/publish/deprecate.sh 0.2.0 "superseded by 0.2.1"
#
# A version that is not on npm, or already carries exactly this message, is skipped, so the script
# can be run again after an interruption. To undo: run it with an empty message, "".
set -euo pipefail
VERSION="${1:?which version, for example 0.2.0}"
MESSAGE="${2?the message, in quotes; an empty \"\" removes a deprecation}"
NAMES=(@gatedpath/chains @gatedpath/agent-rules @gatedpath/preflight @gatedpath/frontend-kit @gatedpath/mcp @gatedpath/ops-kit @gatedpath/receptor-mock @gatedpath/contract-kit create-redbelly-dapp)

WHO="$(npm whoami 2>/dev/null)" || { echo "Not logged in. Run: npm login"; exit 1; }
echo "npm account: $WHO"
echo "This marks version $VERSION of ${#NAMES[@]} public packages as deprecated with the message:"
echo "  \"$MESSAGE\""
read -r -p "Type DEPRECATE to continue: " answer
[ "$answer" = "DEPRECATE" ] || { echo "Stopped. Nothing was changed."; exit 1; }

for name in "${NAMES[@]}"; do
  echo; echo "== $name@$VERSION"
  if [ "$(npm view "$name@$VERSION" version 2>/dev/null)" != "$VERSION" ]; then echo "not on npm, skipped"; continue; fi
  if [ "$(npm view "$name@$VERSION" deprecated 2>/dev/null)" = "$MESSAGE" ] && [ -n "$MESSAGE" ]; then echo "already carries this message, skipped"; continue; fi
  npm deprecate "$name@$VERSION" "$MESSAGE"
done
echo; echo "Done."
