#!/usr/bin/env bash
# Version 2's payment terms on the local fork that `npm run dev -- --no-web --port 8551 --request-id 708`
# started (it deploys the project's contract from src, so this is the v2 code): a listing cancelled by its
# lister, a stale listing cancelled by anyone after the window, a funded invoice collected from the business's
# pre-authorised allowance after the due date, a default declared after the grace period and then cured by a
# late repayment, with the business's record read before and after. Every sender is an unlocked Anvil account;
# the clock is moved with evm_increaseTime. Nothing signed on a real network, no key anywhere.
set -u
RPC="${RPC:-http://127.0.0.1:8551}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; REC="$ROOT/deployments/local.json"
[ -f "$REC" ] || { echo "no $REC: start npm run dev -- --no-web --port 8551 --request-id 708 first"; exit 1; }
json() { node -p "JSON.parse(require('fs').readFileSync('$REC','utf8'))$1"; }
acct() { cast rpc eth_accounts --rpc-url "$RPC" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[$1]"; }
c() { cast call --rpc-url "$RPC" "$@"; }
send() { local from="$1" to="$2"; shift 2; cast send --rpc-url "$RPC" --unlocked --from "$from" "$to" "$@" --json \
  | node -p "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); '    status '+r.status+'  gas '+parseInt(r.gasUsed,16)"; }
refuse() { local from="$1" to="$2"; shift 2; local out; out="$(cast call --rpc-url "$RPC" --from "$from" "$to" "$@" 2>&1)"
  local data; data="$(printf '%s' "$out" | grep -oE 'data: "0x[0-9a-fA-F]+"' | head -1 | grep -oE '0x[0-9a-fA-F]+')"
  [ -z "$data" ] && { echo "    NOT REFUSED: ${out:0:120}"; return 1; }
  local sel="${data:0:10}"; for sig in 'TooEarly(uint256,uint64)' 'WrongStatus(uint256,uint8,uint8)' 'NotTheInvestor(uint256,address)' 'NotEligible(address,uint64)' 'ERC20InsufficientAllowance(address,uint256,uint256)'; do
    if [ "$sel" = "$(cast sig "$sig")" ]; then echo "    refused: ${sig%%(*}($(cast calldata-decode "$sig" "$data" | paste -sd ',' - | sed 's/,/, /g'))"; return 0; fi; done
  echo "    refused, selector $sel"; }
warp() { cast rpc evm_increaseTime "$1" --rpc-url "$RPC" >/dev/null; cast rpc evm_mine --rpc-url "$RPC" >/dev/null; }
now() { cast block latest --rpc-url "$RPC" -f timestamp; }
st() { c "$FIN" "invoice(uint256)((address,address,uint256,uint16,uint64,uint8,bytes32))" "$1" | sed 's/[()]//g' | awk -F', ' '{print $6}'; }
name() { case "$1" in 0) echo None;; 1) echo Listed;; 2) echo Funded;; 3) echo Repaid;; 4) echo Released;; 5) echo Defaulted;; 6) echo Cancelled;; esac; }
step() { echo; echo "== $*"; }
FIN="$(json .contract)"; MOCK="$(json .verifier)"; DEPLOYER="$(json .deployer.address)"; INVESTOR="$(json '.wallets[1].address')"
DELEGATE="$(acct 8)"; STRANGER="$(acct 9)"; USD="$(c "$FIN" "stablecoin()(address)")"
FACE=10000000000; ADV=9700000000; DOC="$(cast keccak "INV-2026-0417.pdf")"
send "$DEPLOYER" "$MOCK" "setStatus(address,uint64,uint8)" "$DELEGATE" 0 1 >/dev/null
send "$DEPLOYER" "$USD" "mint(address,uint256)" "$INVESTOR" $((ADV*2)) >/dev/null; send "$INVESTOR" "$USD" "approve(address,uint256)" "$FIN" $((ADV*2)) >/dev/null
step "0. v2 on the fork: $FIN  grace $(c "$FIN" 'gracePeriod()(uint64)') s  listing window $(c "$FIN" 'listingWindow()(uint64)') s  defaultsBy(business) $(c "$FIN" 'defaultsBy(address)(uint256)' "$DELEGATE")"
step "1. The lister cancels its own listing at once; a stranger cannot until the window has passed"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 $(( $(now) + 30*86400 )) "$DOC" >/dev/null; ID1=$(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}')
echo "  stranger cancels $ID1:"; refuse "$STRANGER" "$FIN" "cancel(uint256)" "$ID1"
echo "  the lister cancels $ID1:"; send "$DELEGATE" "$FIN" "cancel(uint256)" "$ID1"; echo "    invoice $ID1: $(name "$(st "$ID1")")"
echo "  the investor funds the cancelled $ID1:"; refuse "$INVESTOR" "$FIN" "fund(uint256)" "$ID1"
step "2. Collect: a funded invoice, the business pre-authorised the face value, the due date passes, anyone pulls it"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 $(( $(now) + 30*86400 )) "$DOC" >/dev/null; ID2=$(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}')
send "$INVESTOR" "$FIN" "fund(uint256)" "$ID2" >/dev/null
send "$DEPLOYER" "$USD" "mint(address,uint256)" "$DELEGATE" $((FACE - ADV)) >/dev/null; send "$DELEGATE" "$USD" "approve(address,uint256)" "$FIN" "$FACE" >/dev/null
echo "  a stranger collects $ID2 before the due date:"; refuse "$STRANGER" "$FIN" "collect(uint256)" "$ID2"
warp $((31*86400)); echo "    isOverdue($ID2) $(c "$FIN" 'isOverdue(uint256)(bool)' "$ID2") a day after the due date"
echo "  a stranger collects $ID2 now:"; send "$STRANGER" "$FIN" "collect(uint256)" "$ID2"; echo "    invoice $ID2: $(name "$(st "$ID2")")   contract holds $(c "$USD" 'balanceOf(address)(uint256)' "$FIN" | awk '{print $1}')   business left with $(c "$USD" 'balanceOf(address)(uint256)' "$DELEGATE" | awk '{print $1}')"
send "$INVESTOR" "$FIN" "release(uint256)" "$ID2" >/dev/null; echo "    released to the investor: $(name "$(st "$ID2")")"
step "3. Default: a funded invoice, nothing pre-authorised, the due date and the grace period pass, the investor declares it; a late payment cures it"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 $(( $(now) + 30*86400 )) "$DOC" >/dev/null; ID3=$(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}')
send "$INVESTOR" "$FIN" "fund(uint256)" "$ID3" >/dev/null
warp $((31*86400)); echo "  collect $ID3 with no allowance (the evidence of non-payment):"; refuse "$INVESTOR" "$FIN" "collect(uint256)" "$ID3"
echo "  declare default a day after the due date, inside the grace period:"; refuse "$INVESTOR" "$FIN" "declareDefault(uint256)" "$ID3"
warp $((7*86400)); echo "  a stranger declares it after the grace period:"; refuse "$STRANGER" "$FIN" "declareDefault(uint256)" "$ID3"
echo "  the investor declares it:"; send "$INVESTOR" "$FIN" "declareDefault(uint256)" "$ID3"
echo "    invoice $ID3: $(name "$(st "$ID3")")   defaultsBy(business) $(c "$FIN" 'defaultsBy(address)(uint256)' "$DELEGATE")   unpaidBy(business) $(c "$FIN" 'unpaidBy(address)(uint256)' "$DELEGATE")"
echo "  the business pays late:"; send "$DEPLOYER" "$USD" "mint(address,uint256)" "$DELEGATE" "$FACE" >/dev/null; send "$DELEGATE" "$USD" "approve(address,uint256)" "$FIN" "$FACE" >/dev/null; send "$DELEGATE" "$FIN" "repay(uint256)" "$ID3"
echo "    invoice $ID3: $(name "$(st "$ID3")")   defaultsBy(business) $(c "$FIN" 'defaultsBy(address)(uint256)' "$DELEGATE") (history stays)   unpaidBy(business) $(c "$FIN" 'unpaidBy(address)(uint256)' "$DELEGATE") (cured)"
send "$INVESTOR" "$FIN" "release(uint256)" "$ID3" >/dev/null; echo "    released: $(name "$(st "$ID3")")"
step "4. A stale listing: listed, never funded, the window passes, a stranger closes it"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 $(( $(now) + 86400 )) "$DOC" >/dev/null; ID4=$(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}')
warp $((32*86400)); echo "  stranger cancels $ID4:"; send "$STRANGER" "$FIN" "cancel(uint256)" "$ID4"; echo "    invoice $ID4: $(name "$(st "$ID4")")"
step "5. Done on the fork; nothing reached 153"
