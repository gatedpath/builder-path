#!/usr/bin/env bash
# Card 7 rehearsal on the local fork that `npm run dev -- --no-web --port 8547` started.
# Reads deployments/local.json (addresses and Anvil account indices, never a key) and walks the
# ticket's whole day with cast: the five seeded wallets try to buy, a resale over and under the
# cap, a plain transfer, the door, a transfer after check-in, two refunds. Every signer is an
# unlocked Anvil account on chain 31337; nothing here touches a real network.
#
#   bash scripts/rehearse-ticket.sh | tee rehearsal-output.txt
set -u
RPC="${RPC:-http://127.0.0.1:8547}"
cd "$(dirname "$0")/.."
REC=deployments/local.json
[ -f "$REC" ] || { echo "no $REC: start npm run dev -- --no-web --port 8547 first"; exit 1; }
j() { node -p "JSON.parse(require('fs').readFileSync('$REC','utf8'))$1"; }
CHAIN=$(j .chainId); FORK=$(j .forkOf); T=$(j .contract); V=$(j .verifier); REQ=$(j .requestId); DEPLOYER=$(j .deployer.address)
W_NEVER=$(j '.wallets[0].address'); W_VALID=$(j '.wallets[1].address'); W_EXPIRED=$(j '.wallets[2].address')
W_REVOKED=$(j '.wallets[3].address'); W_WRONG=$(j '.wallets[4].address')
# A second verified buyer for the resale: Anvil account 8 (the loop uses 2 to 7; 0 and 1 are never used).
W_BUYER=$(cast rpc eth_accounts --rpc-url "$RPC" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[8]")

STEP=0
step() { STEP=$((STEP+1)); echo; echo "== $STEP. $*"; }
rd() { cast call "$T" "$@" --rpc-url "$RPC"; }
send() { # send <from> <value-wei> <sig> [args...]  prints status and gas
  local from=$1 value=$2; shift 2
  local out; out=$(cast send "$T" "$@" --value "$value" --unlocked --from "$from" --rpc-url "$RPC" --json 2>&1) || { echo "   FAILED: $(echo "$out" | tail -3)"; return 1; }
  echo "   ok: status $(echo "$out" | node -p "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); r.status+', block '+parseInt(r.blockNumber)+', gas '+parseInt(r.gasUsed)")"
}
expect_revert() { # expect_revert <errorSig> <from> <value-wei> <sig> [args...]
  local errsig=$1 from=$2 value=$3; shift 3
  local sel; sel=$(cast sig "$errsig")
  local out; out=$(cast call "$T" "$@" --value "$value" --from "$from" --rpc-url "$RPC" 2>&1)
  local data; data=$(echo "$out" | grep -oE '0x[0-9a-fA-F]{8,}' | head -1)
  if [ -n "$data" ] && [ "${data:0:10}" = "$sel" ]; then
    local args; args=$(cast abi-decode --input "$errsig" "$data" 2>/dev/null | tr '\n' ' ')
    echo "   refused as expected: $errsig  ${args:-$data}"
  else
    echo "   UNEXPECTED: wanted $errsig ($sel), got: $out"; return 1
  fi
}
bal() { cast balance "$1" --rpc-url "$RPC" --ether; }
status_of() { cast call "$V" "eligibilityStatus(address,uint64)(uint8)" "$1" "$REQ" --rpc-url "$RPC"; }

echo "Card 7 rehearsal, $(date -u +%Y-%m-%dT%H:%M:%SZ), Foundry $(cast --version | head -1 | sed 's/cast //')"
echo "Anvil chain $CHAIN, fork of $FORK, block $(cast block-number --rpc-url "$RPC"), rpc $RPC"
echo "GatedTicket $T   ReceptorMock $V   request id $REQ"
FACE=$(rd "faceValue()(uint256)" | awk '{print $1}'); CAP=$(rd "resaleCap()(uint256)" | awk '{print $1}')
echo "face value $(cast from-wei "$FACE") RBNT, resale cap $(cast from-wei "$CAP") RBNT ($(rd 'resaleCapBps()(uint256)' | awk '{print $1}') bps), max supply $(rd 'maxSupply()(uint256)' | awk '{print $1}'), sales open: $(rd 'salesOpen()(bool)')"
echo "organiser and door: Anvil account 7 $DEPLOYER"
echo "wallets: NeverIssued $W_NEVER | Valid $W_VALID | Expired $W_EXPIRED | Revoked $W_REVOKED | WrongJurisdiction $W_WRONG"

step "The five seeded wallets try to buy at face value"
for pair in "NeverIssued:$W_NEVER" "Expired:$W_EXPIRED" "Revoked:$W_REVOKED" "WrongJurisdiction:$W_WRONG"; do
  name=${pair%%:*}; w=${pair#*:}
  echo " $name ($w), mock status $(status_of "$w"), canPurchase $(rd 'canPurchase(address)(bool)' "$w"):"
  expect_revert "NotEligible(address,uint64)" "$w" "$FACE" "purchase()"
done
echo " Valid ($W_VALID), mock status $(status_of "$W_VALID"), canPurchase $(rd 'canPurchase(address)(bool)' "$W_VALID"):"
send "$W_VALID" "$FACE" "purchase()"
echo "   ownerOf(0) = $(rd 'ownerOf(uint256)(address)' 0)   minted = $(rd 'minted()(uint256)' | awk '{print $1}')   contract balance $(bal "$T") RBNT"

step "Wrong price is refused (0.5 RBNT for a 1 RBNT ticket)"
expect_revert "WrongPrice(uint256,uint256)" "$W_VALID" "$(cast to-wei 0.5)" "purchase()"

step "Resale over the cap: the holder lists ticket 0 at cap + 1 wei"
expect_revert "AboveResaleCap(uint256,uint256)" "$W_VALID" 0 "list(uint256,uint256)" 0 "$((CAP+1))"

step "Resale at the cap: listed, then bought by a second verified wallet (Anvil account 8, set Valid on the mock)"
send "$W_VALID" 0 "list(uint256,uint256)" 0 "$CAP"
echo "   listings(0) = $(rd 'listings(uint256)(bool,uint256)' 0 | tr '\n' ' ')"
cast send "$V" "setStatus(address,uint64,uint8)" "$W_BUYER" "$REQ" 1 --unlocked --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null
echo "   buyer $W_BUYER mock status $(status_of "$W_BUYER")"
echo "   before: seller $(bal "$W_VALID") RBNT, buyer $(bal "$W_BUYER") RBNT"
echo "   buyer pays the cap minus 1 wei first:"
expect_revert "WrongPrice(uint256,uint256)" "$W_BUYER" "$((CAP-1))" "buy(uint256)" 0
echo "   buyer pays exactly the cap:"
send "$W_BUYER" "$CAP" "buy(uint256)" 0
echo "   after:  seller $(bal "$W_VALID") RBNT, buyer $(bal "$W_BUYER") RBNT   ownerOf(0) = $(rd 'ownerOf(uint256)(address)' 0)"

step "An unverified wallet cannot buy a resold ticket either"
send "$W_BUYER" 0 "list(uint256,uint256)" 0 "$(cast to-wei 0.5)"
expect_revert "NotEligible(address,uint64)" "$W_NEVER" "$(cast to-wei 0.5)" "buy(uint256)" 0

step "Resale under the cap: the first holder buys it back at 0.5 RBNT"
send "$W_VALID" "$(cast to-wei 0.5)" "buy(uint256)" 0
echo "   ownerOf(0) = $(rd 'ownerOf(uint256)(address)' 0)"

step "A plain transferFrom is refused even between two verified wallets: the contract cannot see its price"
expect_revert "TransferOnlyThroughResale(uint256)" "$W_VALID" 0 "transferFrom(address,address,uint256)" "$W_VALID" "$W_BUYER" 0

step "The door checks ticket 0 in (Anvil account 7 holds DOOR_ROLE); a holder cannot"
expect_revert "AccessControlUnauthorizedAccount(address,bytes32)" "$W_VALID" 0 "checkIn(uint256)" 0
send "$DEPLOYER" 0 "checkIn(uint256)" 0
echo "   checkedIn(0) = $(rd 'checkedIn(uint256)(bool)' 0)   isTransferable(0) = $(rd 'isTransferable(uint256)(bool)' 0)"

step "After check-in nothing moves it: list, buy and transferFrom all refuse"
expect_revert "TicketUsed(uint256)" "$W_VALID" 0 "list(uint256,uint256)" 0 "$FACE"
expect_revert "NotListed(uint256)" "$W_BUYER" "$FACE" "buy(uint256)" 0
expect_revert "TicketUsed(uint256)" "$W_VALID" 0 "transferFrom(address,address,uint256)" "$W_VALID" "$W_BUYER" 0
echo "   a second check-in is refused too:"
expect_revert "AlreadyCheckedIn(uint256)" "$DEPLOYER" 0 "checkIn(uint256)" 0

step "The organiser refunds the checked-in ticket 0 at face value; a holder cannot refund"
expect_revert "AccessControlUnauthorizedAccount(address,bytes32)" "$W_VALID" 0 "refund(uint256)" 0
echo "   before: holder $(bal "$W_VALID") RBNT, contract $(bal "$T") RBNT"
send "$DEPLOYER" 0 "refund(uint256)" 0
echo "   after:  holder $(bal "$W_VALID") RBNT, contract $(bal "$T") RBNT, balanceOf(holder) = $(rd 'balanceOf(address)(uint256)' "$W_VALID" | awk '{print $1}')"
expect_revert "ERC721NonexistentToken(uint256)" "$W_VALID" 0 "ownerOf(uint256)" 0

step "A refund reaches a holder whose credential has since been revoked (ticket 1)"
send "$W_VALID" "$FACE" "purchase()"
cast send "$V" "setStatus(address,uint64,uint8)" "$W_VALID" "$REQ" 3 --unlocked --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null
echo "   holder mock status now $(status_of "$W_VALID") (3 = Revoked); the holder can no longer buy:"
expect_revert "NotEligible(address,uint64)" "$W_VALID" "$FACE" "purchase()"
echo "   but the refund still lands:"
send "$DEPLOYER" 0 "refund(uint256)" 1
echo "   balanceOf(holder) = $(rd 'balanceOf(address)(uint256)' "$W_VALID" | awk '{print $1}'), contract $(bal "$T") RBNT"
cast send "$V" "setStatus(address,uint64,uint8)" "$W_VALID" "$REQ" 1 --unlocked --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null
echo "   holder restored to Valid for the web page: $(status_of "$W_VALID")"

echo
echo "Done: $STEP steps on Anvil chain $CHAIN (a fork of $FORK). Nothing was signed on a real network."
