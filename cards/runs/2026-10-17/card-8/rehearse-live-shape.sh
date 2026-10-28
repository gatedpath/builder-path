#!/usr/bin/env bash
# The live-shape rehearsal for card 8, 25 October 2026. Runs against a fork of testnet taken at today's
# block, so the InvoiceFinancing and the mUSD that are REALLY deployed on 153 are the contracts under
# test, and swaps the shared ReceptorMock for the two verifier shapes a live deployment would have:
#   - a BusinessDelegateAdapter over a BusinessIdentifier (the business-delegate recipe: a role read,
#     not a proof), here a MockBusinessIdentifier in the shape Vine prints;
#   - the kit's own Iden3VerifierAdapter over a ZKPVerifier (the AU wholesale recipe, request 708), here a
#     MockZKPVerifierV2 that answers isProofVerified and reverts for an unset request, as the real one does.
# Then the whole life of an invoice with realistic values, the due date passing, a delegate removed
# mid-flight, a proof withdrawn and restored, the input edges, and what the money's path shows.
#
# Every sender is an unlocked Anvil account on the fork; the contract's owner (the dev wallet) is
# impersonated by Anvil, which is the one thing a fork can do that the network cannot. Nothing is signed,
# nothing reaches 153, no key appears anywhere.
set -u
RPC="${RPC:-http://127.0.0.1:8550}"
FIN=0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90          # InvoiceFinancing, live on 153 since block 3,056,722
USD=0x9cF4E639C35141cF4C36E5c38dc88151FB89E6Db          # its MockStablecoin (mUSD, 6 decimals)
OWNER=0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59        # the contract's owner on 153; impersonated here only
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/contracts"

acct() { cast rpc eth_accounts --rpc-url "$RPC" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[$1]"; }
c() { cast call --rpc-url "$RPC" "$@"; }
send() { local from="$1" to="$2"; shift 2
  cast send --rpc-url "$RPC" --unlocked --from "$from" "$to" "$@" --json \
    | node -p "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); '    status '+r.status+'  gas '+parseInt(r.gasUsed,16)+'  block '+parseInt(r.blockNumber,16)"; }
refuse() { local from="$1" to="$2"; shift 2
  local out; out="$(cast call --rpc-url "$RPC" --from "$from" "$to" "$@" 2>&1)"
  local data; data="$(printf '%s' "$out" | grep -oE 'data: "0x[0-9a-fA-F]+"' | head -1 | grep -oE '0x[0-9a-fA-F]+')"
  if [ -z "$data" ]; then echo "    NOT REFUSED (unexpected): $out"; return 1; fi
  local sel="${data:0:10}" name
  case "$sel" in
    "$(cast sig 'NotEligible(address,uint64)')") name="NotEligible(address,uint64)";;
    "$(cast sig 'WrongStatus(uint256,uint8,uint8)')") name="WrongStatus(uint256,uint8,uint8)";;
    "$(cast sig 'NotTheInvestor(uint256,address)')") name="NotTheInvestor(uint256,address)";;
    "$(cast sig 'BadDiscount(uint16)')") name="BadDiscount(uint16)";;
    "$(cast sig 'DueDateInThePast(uint64)')") name="DueDateInThePast(uint64)";;
    "$(cast sig 'ZeroFaceValue()')") echo "    refused: ZeroFaceValue()  selector $sel"; return 0;;
    "$(cast sig 'UnauthorisedAccess(string)')") name="UnauthorisedAccess(string)";;
    "$(cast sig 'RequestIdNotFound(uint64)')") name="RequestIdNotFound(uint64)";;
    "$(cast sig 'OwnableUnauthorizedAccount(address)')") name="OwnableUnauthorizedAccount(address)";;
    *) echo "    refused, selector $sel, data $data"; return 0;;
  esac
  echo "    refused: ${name%%(*}($(cast calldata-decode "$name" "$data" | paste -sd ',' - | sed 's/,/, /g'))  selector $sel"; }
create() { # create <path:Name> [constructor args...]: prints the address
  local target="$1"; shift
  forge create "$target" --rpc-url "$RPC" --unlocked --from "$IDP" --broadcast ${1:+--constructor-args "$@"} 2>&1 | grep -oE 'Deployed to: 0x[0-9a-fA-F]+' | cut -d' ' -f3; }
bal() { c "$USD" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
musd() { node -p "(BigInt('$1')/1000000n).toLocaleString('en-US')+'.'+String(BigInt('$1')%1000000n).padStart(6,'0').slice(0,2)"; }
status_name() { case "$1" in 0) echo None;; 1) echo Listed;; 2) echo Funded;; 3) echo Repaid;; 4) echo Released;; *) echo "$1";; esac; }
inv() { local raw; raw="$(c "$FIN" "invoice(uint256)((address,address,uint256,uint16,uint64,uint8,bytes32))" "$1")"
  local s; s="$(printf '%s' "$raw" | sed 's/[()]//g' | awk -F', ' '{print $6}')"; echo "    invoice $1: $(status_name "$s")  $raw"; }
now() { cast block latest --rpc-url "$RPC" -f timestamp; }
step() { echo; echo "== $*"; }

IDP="$(acct 7)"; REP="$(acct 8)"; DELEGATE="$(acct 9)"; INVESTOR="$(acct 3)"; NOPROOF="$(acct 4)"; SECOND="$(acct 5)"
FACE=48250000000; DISC=250; ADVANCE=47043750000      # 48,250.00 mUSD at 250 bps: 47,043.75
DUE=$(( $(now) + 45*24*3600 )); DOC="$(cast keccak "INV-2026-1042.pdf")"

step "0. Where we are: a fork of 153 at today's block, the live contracts under test"
echo "    rpc $RPC  chain id $(cast chain-id --rpc-url "$RPC")  block $(cast block-number --rpc-url "$RPC")  time $(now)"
echo "    InvoiceFinancing $FIN  owner $(c "$FIN" 'owner()(address)')  invoiceCount $(c "$FIN" 'invoiceCount()(uint256)')"
echo "    investor gate now: verifier $(c "$FIN" 'verifier()(address)') request $(c "$FIN" 'requestId()(uint64)')   lister gate now: $(c "$FIN" 'businessVerifier()(address)') request $(c "$FIN" 'listerRequestId()(uint64)')"
echo "    stablecoin $USD $(c "$USD" 'symbol()(string)') $(c "$USD" 'decimals()(uint8)') decimals"
cast rpc anvil_impersonateAccount "$OWNER" --rpc-url "$RPC" >/dev/null; cast rpc anvil_setBalance "$OWNER" 0x3635C9ADC5DEA00000 --rpc-url "$RPC" >/dev/null
echo "    owner impersonated on the fork (a fork can; the network cannot)"

step "1. The live shapes: a BusinessIdentifier with its adapter, a ZKPVerifier (2.x shape) with the kit's Iden3 adapter"
BIZ="$(create src/mocks/MockBusinessIdentifier.sol:MockBusinessIdentifier "$IDP" "$REP" "Acme Invoices Pty Ltd" "ACN" "123 456 789" "1 Example Street, Sydney NSW 2000")"
BIZ_ADAPTER="$(create src/adapters/BusinessDelegateAdapter.sol:BusinessDelegateAdapter "$BIZ")"
ZKP="$(create src/mocks/MockZKPVerifierV2.sol:MockZKPVerifierV2)"
send "$IDP" "$ZKP" "setZKPRequest(uint64)" 708 >/dev/null
INV_ADAPTER="$(create lib/receptor-mock/src/adapters/Iden3VerifierAdapter.sol:Iden3VerifierAdapter "$ZKP" 1)"
echo "    identifier $BIZ (idp = account 7, representative = account 8; $(c "$BIZ" 'companyName()(string)'))"
echo "    business adapter $BIZ_ADAPTER   zkp verifier $ZKP (request 708 set)   investor adapter $INV_ADAPTER (surface ZKPVerifierV2)"

step "2. The owner repoints the live contract: lister gate to the business adapter (request 0), investor gate to the Iden3 adapter"
send "$OWNER" "$FIN" "setBusinessVerifier(address,uint64)" "$BIZ_ADAPTER" 0
send "$OWNER" "$FIN" "setVerifier(address)" "$INV_ADAPTER"
echo "    investor gate: $(c "$FIN" 'verifier()(address)') request $(c "$FIN" 'requestId()(uint64)')   lister gate: $(c "$FIN" 'businessVerifier()(address)') request $(c "$FIN" 'listerRequestId()(uint64)')"
echo "  a stranger (account 3) tries the same:"; refuse "$INVESTOR" "$FIN" "setVerifier(address)" "$INV_ADAPTER"

step "3. Roles on the identifier: the representative adds account 9 as a delegate; the reads are live"
send "$REP" "$BIZ" "addAuthorisedDelegate(address[])" "[$DELEGATE]"
echo "    isLister(delegate 9) $(c "$FIN" 'isLister(address)(bool)' "$DELEGATE")   isLister(representative 8) $(c "$FIN" 'isLister(address)(bool)' "$REP")   isLister(investor 3) $(c "$FIN" 'isLister(address)(bool)' "$INVESTOR")"
echo "    adapter request 1 (representatives only): delegate 9 $(c "$BIZ_ADAPTER" 'isEligible(address,uint64)(bool)' "$DELEGATE" 1)   representative 8 $(c "$BIZ_ADAPTER" 'isEligible(address,uint64)(bool)' "$REP" 1)   request 2 (unknown): representative 8 $(c "$BIZ_ADAPTER" 'isEligible(address,uint64)(bool)' "$REP" 2)"
echo "  the delegate tries to add a delegate of its own:"; refuse "$DELEGATE" "$BIZ" "addAuthorisedDelegate(address[])" "[$SECOND]"
echo "  the representative tries to add a representative (the issuer's right):"; refuse "$REP" "$BIZ" "addAuthorisedRepresentative(address[])" "[$SECOND]"

step "4. Proofs on the ZKP verifier: account 3 has an accepted proof for 708, account 4 has none"
send "$IDP" "$ZKP" "recordProof(address,uint64,bool)" "$INVESTOR" 708 true
echo "    isEligible(investor 3) $(c "$FIN" 'isEligible(address)(bool)' "$INVESTOR")   isEligible(account 4) $(c "$FIN" 'isEligible(address)(bool)' "$NOPROOF")   isEligible(delegate 9) $(c "$FIN" 'isEligible(address)(bool)' "$DELEGATE")"
echo "    the adapter over a request never set (709) reads: $(c "$INV_ADAPTER" 'isEligible(address,uint64)(bool)' "$INVESTOR" 709)   (the verifier reverts; the adapter reads false)"
echo "  recording a proof for the unset request 709:"; refuse "$IDP" "$ZKP" "recordProof(address,uint64,bool)" "$INVESTOR" 709 true

step "5. Realistic values, and the input edges: face 48,250.00 mUSD, 250 bps, due in 45 days, document $DOC"
send "$IDP" "$USD" "mint(address,uint256)" "$INVESTOR" "$ADVANCE" >/dev/null; send "$INVESTOR" "$USD" "approve(address,uint256)" "$FIN" "$ADVANCE" >/dev/null
send "$IDP" "$USD" "mint(address,uint256)" "$NOPROOF" "$ADVANCE" >/dev/null; send "$NOPROOF" "$USD" "approve(address,uint256)" "$FIN" "$ADVANCE" >/dev/null
echo "    advanceFor(face, 250) = $(musd "$(c "$FIN" 'advanceFor(uint256,uint16)(uint256)' "$FACE" "$DISC" | awk '{print $1}')") mUSD"
echo "  discount 0:";      refuse "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 0 "$DUE" "$DOC"
echo "  discount 10000:";  refuse "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" 10000 "$DUE" "$DOC"
echo "  due date = now:";  refuse "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" "$DISC" "$(now)" "$DOC"
echo "  face value 0:";    refuse "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" 0 "$DISC" "$DUE" "$DOC"
echo "  the investor (a wholesale credential, not a delegate) lists:"; refuse "$INVESTOR" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" "$DISC" "$DUE" "$DOC"
echo "  the delegate (9) lists invoice $(( $(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}') + 1 )):"
send "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" "$DISC" "$DUE" "$DOC"
ID="$(c "$FIN" 'invoiceCount()(uint256)' | awk '{print $1}')"; inv "$ID"
echo "    rounding: advanceFor(1, 1) = $(c "$FIN" 'advanceFor(uint256,uint16)(uint256)' 1 1 | awk '{print $1}') (a 1-unit face at 1 bps gives no discount at all)   advanceFor(39999, 1) = $(c "$FIN" 'advanceFor(uint256,uint16)(uint256)' 39999 1 | awk '{print $1}')"

step "6. Funding: account 4 (no proof) refused, the delegate refused, the investor (3) funds and the advance lands in the DELEGATE's wallet"
echo "  account 4:";  refuse "$NOPROOF" "$FIN" "fund(uint256)" "$ID"
echo "  delegate 9:"; refuse "$DELEGATE" "$FIN" "fund(uint256)" "$ID"
echo "  investor 3:"; send "$INVESTOR" "$FIN" "fund(uint256)" "$ID"; inv "$ID"
echo "    investor $(musd "$(bal "$INVESTOR")")   delegate wallet 9 $(musd "$(bal "$DELEGATE")")   representative 8 $(musd "$(bal "$REP")")   contract $(musd "$(bal "$FIN")")   (the advance went to the wallet that listed, not to a business treasury)"

step "7. The due date passes (50 days on the fork's clock); repayment after it is accepted, nothing enforces the date"
cast rpc evm_increaseTime $((50*24*3600)) --rpc-url "$RPC" >/dev/null; cast rpc evm_mine --rpc-url "$RPC" >/dev/null
echo "    now $(now) > due $DUE: $([ "$(now)" -gt "$DUE" ] && echo yes || echo no)"
echo "  the delegate repays the face value 5 days late:"
send "$IDP" "$USD" "mint(address,uint256)" "$DELEGATE" $((FACE - ADVANCE)) >/dev/null; send "$DELEGATE" "$USD" "approve(address,uint256)" "$FIN" "$FACE" >/dev/null
send "$DELEGATE" "$FIN" "repay(uint256)" "$ID"; inv "$ID"
echo "    contract holds $(musd "$(bal "$FIN")") mUSD"

step "8. A delegate removed mid-flight: the representative removes 9; the next list is refused at once; the repaid invoice is unaffected"
send "$REP" "$BIZ" "removeAuthorisedDelegate(address[])" "[$DELEGATE]"
echo "    isLister(9) $(c "$FIN" 'isLister(address)(bool)' "$DELEGATE")"
echo "  the removed delegate lists again:"; refuse "$DELEGATE" "$FIN" "list(uint256,uint16,uint64,bytes32)" "$FACE" "$DISC" "$(( $(now) + 30*24*3600 ))" "$DOC"
echo "  the owner narrows the lister gate to representatives only (request 1); 9 re-added as a delegate is still refused, 8 passes:"
send "$REP" "$BIZ" "addAuthorisedDelegate(address[])" "[$DELEGATE]" >/dev/null
send "$OWNER" "$FIN" "setBusinessVerifier(address,uint64)" "$BIZ_ADAPTER" 1 >/dev/null
echo "    isLister(delegate 9) $(c "$FIN" 'isLister(address)(bool)' "$DELEGATE")   isLister(representative 8) $(c "$FIN" 'isLister(address)(bool)' "$REP")"
send "$OWNER" "$FIN" "setBusinessVerifier(address,uint64)" "$BIZ_ADAPTER" 0 >/dev/null

step "9. The investor's proof withdrawn (revocation at the verifier): release refused, the money stays; restored: released"
send "$IDP" "$ZKP" "recordProof(address,uint64,bool)" "$INVESTOR" 708 false >/dev/null
echo "  investor 3, proof withdrawn, releases:"; refuse "$INVESTOR" "$FIN" "release(uint256)" "$ID"
echo "  the delegate releases:"; refuse "$DELEGATE" "$FIN" "release(uint256)" "$ID"
send "$IDP" "$ZKP" "recordProof(address,uint64,bool)" "$INVESTOR" 708 true >/dev/null
echo "  investor 3, proof restored, releases:"; send "$INVESTOR" "$FIN" "release(uint256)" "$ID"; inv "$ID"
echo "    investor $(musd "$(bal "$INVESTOR")") mUSD (paid 47,043.75, received 48,250.00)   contract $(musd "$(bal "$FIN")")"

step "10. Done on the fork. Chain $(cast chain-id --rpc-url "$RPC"), block $(cast block-number --rpc-url "$RPC"); nothing reached 153; the live contract on 153 still points at the shared mock"
