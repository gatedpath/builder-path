#!/usr/bin/env bash
# Rehearses InvoiceFinancing on the local fork that `npm run dev -- --no-web --port 8548` started:
# the business delegate lists, an eligible investor funds at a discount, the business repays, the
# investor releases, and every wrong wallet is refused with the error the contract names.
#
# Every sender is an unlocked Anvil account on chain 31337. Accounts 2 to 6 are the five investor
# states `npm run dev` seeded on request id 708; accounts 8 and 9 are seeded here on the lister
# request id (a current delegate and a removed one). Accounts 0 and 1 are never used. Nothing is
# signed on a real network and no key appears anywhere: `--unlocked` asks Anvil to sign.
set -u
RPC="${RPC:-http://127.0.0.1:8548}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REC="$ROOT/deployments/local.json"
[ -f "$REC" ] || { echo "no $REC: start npm run dev -- --no-web --port 8548 first"; exit 1; }

json() { node -p "JSON.parse(require('fs').readFileSync('$REC','utf8'))$1"; }
acct() { cast rpc eth_accounts --rpc-url "$RPC" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[$1]"; }
c() { cast call --rpc-url "$RPC" "$@"; }
send() { # send <from> <to> <sig> [args...]: prints the status and gas of the mined transaction
  local from="$1" to="$2"; shift 2
  cast send --rpc-url "$RPC" --unlocked --from "$from" "$to" "$@" --json \
    | node -p "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); 'status '+r.status+'  gas '+parseInt(r.gasUsed,16)+'  block '+parseInt(r.blockNumber,16)"
}
refuse() { # refuse <from> <to> <sig> [args...]: the call must revert; prints the decoded error
  local from="$1" to="$2"; shift 2
  local out; out="$(cast call --rpc-url "$RPC" --from "$from" "$to" "$@" 2>&1)"
  local data; data="$(printf '%s' "$out" | grep -oE 'data: "0x[0-9a-fA-F]+"' | head -1 | grep -oE '0x[0-9a-fA-F]+')"
  if [ -z "$data" ]; then echo "    NOT REFUSED (unexpected): $out"; return 1; fi
  local sel="${data:0:10}" name
  case "$sel" in
    "$SEL_NOT_ELIGIBLE") name="NotEligible(address,uint64)";;
    "$SEL_WRONG_STATUS") name="WrongStatus(uint256,uint8,uint8)";;
    "$SEL_NOT_INVESTOR") name="NotTheInvestor(uint256,address)";;
    *) echo "    refused, selector $sel, data $data"; return 0;;
  esac
  echo "    refused: ${name%%(*}($(cast calldata-decode "$name" "$data" | paste -sd ',' - | sed 's/,/, /g'))  selector $sel"
}
bal() { c "$USD" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
status_name() { case "$1" in 0) echo None;; 1) echo Listed;; 2) echo Funded;; 3) echo Repaid;; 4) echo Released;; *) echo "$1";; esac; }
inv() { # inv <id>: one line of the invoice
  local raw; raw="$(c "$FIN" "invoice(uint256)((address,address,uint256,uint16,uint64,uint8,bytes32))" "$1")"
  local s; s="$(printf '%s' "$raw" | sed 's/[()]//g' | awk -F', ' '{print $6}')"
  echo "    invoice $1: $(status_name "$s")  $raw"
}
step() { echo; echo "== $*"; }

SEL_NOT_ELIGIBLE="$(cast sig 'NotEligible(address,uint64)')"
SEL_WRONG_STATUS="$(cast sig 'WrongStatus(uint256,uint8,uint8)')"
SEL_NOT_INVESTOR="$(cast sig 'NotTheInvestor(uint256,address)')"

FIN="$(json .contract)"; MOCK="$(json .verifier)"; REQ="$(json .requestId)"; DEPLOYER="$(json .deployer.address)"
W_NEVER="$(json '.wallets[0].address')"; W_VALID="$(json '.wallets[1].address')"; W_EXPIRED="$(json '.wallets[2].address')"
W_REVOKED="$(json '.wallets[3].address')"; W_WRONG="$(json '.wallets[4].address')"
DELEGATE="$(acct 8)"; FORMER="$(acct 9)"
USD="$(c "$FIN" "stablecoin()(address)")"
LISTER_REQ="$(c "$FIN" "listerRequestId()(uint64)")"
BIZ_VERIFIER="$(c "$FIN" "businessVerifier()(address)")"
FACE=10000000000      # 10,000.000000 mUSD
ADVANCE=9700000000    # at 300 bps
DUE=$(( $(date +%s) + 30*24*3600 ))
DOC="$(cast keccak "invoice INV-2026-0417.pdf")"

step "0. Where we are"
echo "    rpc $RPC  chain id $(cast chain-id --rpc-url "$RPC")  block $(cast block-number --rpc-url "$RPC")  fork of $(json .forkOf)"
echo "    InvoiceFinancing $FIN"
echo "    investor gate: verifier $(c "$FIN" 'verifier()(address)')  request id $REQ (au-wholesale-investor)"
echo "    lister gate:   verifier $BIZ_VERIFIER  request id $LISTER_REQ (business-delegate, either role)"
echo "    stablecoin $USD ($(c "$USD" 'symbol()(string)'), $(c "$USD" 'decimals()(uint8)') decimals)   owner $(c "$FIN" 'owner()(address)') (Anvil account 7)"
echo "    investors seeded by npm run dev on $REQ: NeverIssued $W_NEVER (2), Valid $W_VALID (3), Expired $W_EXPIRED (4), Revoked $W_REVOKED (5), WrongJurisdiction $W_WRONG (6)"

step "1. The business side: account 8 is a current delegate, account 9 a removed one (request id $LISTER_REQ on the same mock)"
send "$DEPLOYER" "$MOCK" "setStatus(address,uint64,uint8)" "$DELEGATE" "$LISTER_REQ" 1
send "$DEPLOYER" "$MOCK" "setStatus(address,uint64,uint8)" "$FORMER" "$LISTER_REQ" 3
echo "    isLister(delegate 8)      $(c "$FIN" 'isLister(address)(bool)' "$DELEGATE")"
echo "    isLister(former 9)        $(c "$FIN" 'isLister(address)(bool)' "$FORMER")"
echo "    isLister(valid investor)  $(c "$FIN" 'isLister(address)(bool)' "$W_VALID")   (a wholesale credential is not a delegate role)"
echo "    isEligible(delegate 8)    $(c "$FIN" 'isEligible(address)(bool)' "$DELEGATE")   (a delegate role is not a wholesale credential)"
echo "    isEligible(valid investor) $(c "$FIN" 'isEligible(address)(bool)' "$W_VALID")"

step "2. Mint mUSD: the advance to every investor wallet so a refusal is the gate and not an empty purse; the face value to the business for repayment"
for w in "$W_NEVER" "$W_VALID" "$W_EXPIRED" "$W_REVOKED" "$W_WRONG"; do
  send "$DEPLOYER" "$USD" "mint(address,uint256)" "$w" "$ADVANCE" >/dev/null
  send "$w" "$USD" "approve(address,uint256)" "$FIN" "$ADVANCE" >/dev/null
done
send "$DEPLOYER" "$USD" "mint(address,uint256)" "$DELEGATE" 300000000 >/dev/null
echo "    investor (3) balance $(bal "$W_VALID")   business (8) balance $(bal "$DELEGATE")   contract $(bal "$FIN")"

step "3. The delegate lists invoice 1: face 10,000 mUSD, 300 bps discount, due in 30 days, document hash $DOC"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 "$DUE" "$DOC"
inv 1
echo "    advanceFor(face, 300) = $(c "$FIN" 'advanceFor(uint256,uint16)(uint256)' "$FACE" 300)"

step "4. Refused on list: the removed delegate, and a valid investor who is nobody's delegate"
echo "  former delegate (9) lists:"; refuse "$FORMER" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 "$DUE" "$DOC"
echo "  valid investor (3) lists:";  refuse "$W_VALID" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 "$DUE" "$DOC"
echo "    invoiceCount still $(c "$FIN" 'invoiceCount()(uint256)')"

step "5. The valid investor (3) funds invoice 1: 9,700 mUSD goes straight to the business"
send "$W_VALID" "$FIN" "fund(uint256)" 1
inv 1
echo "    investor (3) balance $(bal "$W_VALID")   business (8) balance $(bal "$DELEGATE")   contract $(bal "$FIN")"

step "6. The delegate lists invoice 2; the four other investor states and the delegate itself are refused on fund"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 300 "$DUE" "$DOC" >/dev/null
inv 2
echo "  NeverIssued (2):";       refuse "$W_NEVER" "$FIN" "fund(uint256)" 2
echo "  Expired (4):";           refuse "$W_EXPIRED" "$FIN" "fund(uint256)" 2
echo "  Revoked (5):";           refuse "$W_REVOKED" "$FIN" "fund(uint256)" 2
echo "  WrongJurisdiction (6):"; refuse "$W_WRONG" "$FIN" "fund(uint256)" 2
echo "  the delegate (8), no wholesale credential:"; refuse "$DELEGATE" "$FIN" "fund(uint256)" 2
echo "  the valid investor (3) funding invoice 1 again:"; refuse "$W_VALID" "$FIN" "fund(uint256)" 1
echo "    business (8) balance unchanged $(bal "$DELEGATE")"

step "7. Release before repayment is refused; a stranger's repayment is not"
echo "  investor (3) releases invoice 1 while Funded:"; refuse "$W_VALID" "$FIN" "release(uint256)" 1
echo "  the business (8) repays invoice 1, face value into the contract:"
send "$DELEGATE" "$USD" "approve(address,uint256)" "$FIN" "$FACE" >/dev/null
send "$DELEGATE" "$FIN" "repay(uint256)" 1
inv 1
echo "    business (8) balance $(bal "$DELEGATE")   contract $(bal "$FIN")"

step "8. Refused on release: the wrong wallet, and the right wallet whose credential has lapsed"
echo "  NeverIssued (2) releases invoice 1:"; refuse "$W_NEVER" "$FIN" "release(uint256)" 1
echo "  the delegate (8) releases invoice 1:"; refuse "$DELEGATE" "$FIN" "release(uint256)" 1
echo "  the investor's credential is revoked on $REQ:"
send "$DEPLOYER" "$MOCK" "setStatus(address,uint64,uint8)" "$W_VALID" "$REQ" 3 >/dev/null
echo "  investor (3), now Revoked, releases invoice 1:"; refuse "$W_VALID" "$FIN" "release(uint256)" 1
echo "    the face value stays in the contract: $(bal "$FIN")"

step "9. Credential restored, the investor releases invoice 1 and has earned the discount"
send "$DEPLOYER" "$MOCK" "setStatus(address,uint64,uint8)" "$W_VALID" "$REQ" 1 >/dev/null
send "$W_VALID" "$FIN" "release(uint256)" 1
inv 1
echo "    investor (3) balance $(bal "$W_VALID")  (paid 9,700, received 10,000)   business (8) balance $(bal "$DELEGATE")   contract $(bal "$FIN")"
echo "  releasing it twice:"; refuse "$W_VALID" "$FIN" "release(uint256)" 1
echo "  repaying invoice 2, never funded:"; refuse "$DELEGATE" "$FIN" "repay(uint256)" 2

step "10. Done. Chain $(cast chain-id --rpc-url "$RPC"), block $(cast block-number --rpc-url "$RPC"); invoiceCount $(c "$FIN" 'invoiceCount()(uint256)'); nothing left a local Anvil"
