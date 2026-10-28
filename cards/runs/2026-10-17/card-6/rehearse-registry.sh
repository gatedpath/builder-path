#!/usr/bin/env bash
# Rehearses CarbonCreditRegistry on the local loop's fork of testnet (npm run dev -- --no-web --port 8546).
# Every signer is an unlocked Anvil test account on chain 31337; nothing here can sign on a real
# network. Accounts 0 and 1 are never used. Reads deployments/local.json for the loop's ReceptorMock
# and the five seeded wallets, deploys the registry with that mock as its verifier, then walks the
# day: a credentialed issuer mints, a stranger is refused, four ineligible recipients are refused,
# a transfer lands and two are refused, a holder retires, a lapsed holder is frozen, the counter
# never moves back.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${RPC:-http://127.0.0.1:8546}"
RECORD="$ROOT/deployments/local.json"
[ -f "$RECORD" ] || { echo "no $RECORD: start the loop first (npm run dev -- --no-web --port 8546)"; exit 1; }

json() { node -e "const d=JSON.parse(require('fs').readFileSync('$RECORD','utf8')); console.log($1)"; }
VERIFIER=$(json 'd.verifier')
DEPLOYER=$(json 'd.deployer.address')
W_NEVER=$(json 'd.wallets[0].address')   # Anvil 2, NeverIssued on 18
W_VALID=$(json 'd.wallets[1].address')   # Anvil 3, Valid on 18
W_EXPIRED=$(json 'd.wallets[2].address') # Anvil 4, Expired on 18
W_REVOKED=$(json 'd.wallets[3].address') # Anvil 5, Revoked on 18
W_WRONG=$(json 'd.wallets[4].address')   # Anvil 6, WrongJurisdiction on 18
ISSUER=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f   # Anvil 8: will hold the issuer credential (100)
STRANGER=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 # Anvil 9: no credential of any kind at the start
HOLDER_ID=18
ISSUER_ID=100

step() { echo; echo "== $*"; }
send() { cast send --rpc-url "$RPC" --unlocked --from "$@"; }
call() { cast call --rpc-url "$RPC" "$@"; }
# A refusal, shown as cast reports it. The call is simulated from the named wallet so the revert
# data is printed in full; nothing is mined.
refuse() {
  local from=$1; shift
  local out
  out=$(cast call --rpc-url "$RPC" --from "$from" "$@" 2>&1) && { echo "UNEXPECTED SUCCESS: $out"; return 1; }
  echo "refused: $(echo "$out" | tr '\n' ' ' | sed 's/  */ /g')"
}
status() { echo "$1 on $2 -> $(call "$VERIFIER" 'eligibilityStatus(address,uint64)(uint8)' "$1" "$2")  (0 NeverIssued, 1 Valid, 2 Expired, 3 Revoked, 4 WrongJurisdiction)"; }

echo "Rehearsal of CarbonCreditRegistry on a fork of testnet, chain $(cast chain-id --rpc-url "$RPC"), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Selectors to match below: NotEligible(address,uint64) $(cast sig 'NotEligible(address,uint64)'); ERC1155InsufficientBalance(address,uint256,uint256,uint256) $(cast sig 'ERC1155InsufficientBalance(address,uint256,uint256,uint256)')"
echo "ReceptorMock (the loop's): $VERIFIER   deployer/admin: Anvil 7 $DEPLOYER"

step "1. Deploy the registry through its script, after the scaffold's pre-flight, with the loop's mock as VERIFIER"
(cd "$ROOT/contracts" && VERIFIER="$VERIFIER" ADMIN_SAFE="" REQUEST_ID="" ISSUER_REQUEST_ID="" \
  forge script script/DeployRegistry.s.sol --rpc-url "$RPC" --sender "$DEPLOYER" --unlocked --broadcast 2>&1 \
  | grep -E "chain id|deployer|admin:|CarbonCreditRegistry:|verifier:|request id|ONCHAIN EXECUTION|Error|revert" )
REGISTRY=$(node -e "const d=JSON.parse(require('fs').readFileSync('$ROOT/contracts/deployments/31337-CarbonCreditRegistry.json','utf8')); console.log(d.contract)")
echo "registry: $REGISTRY   holder request $(call "$REGISTRY" 'requestId()(uint64)')   issuer request $(call "$REGISTRY" 'issuerRequestId()(uint64)')"

step "2. Give Anvil 8 the issuer credential (request 100) on the mock; nobody else has one"
send "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$ISSUER" $ISSUER_ID 1 >/dev/null
status "$ISSUER" $ISSUER_ID
echo "isIssuer(Anvil 8) $(call "$REGISTRY" 'isIssuer(address)(bool)' "$ISSUER")   isIssuer(Anvil 9) $(call "$REGISTRY" 'isIssuer(address)(bool)' "$STRANGER")"

step "3. The issuer mints 100 credits of project VCS-1234, vintage 2024, to the Valid holder (Anvil 3)"
TX=$(send "$ISSUER" "$REGISTRY" 'mint(address,string,uint16,uint256)' "$W_VALID" "VCS-1234" 2024 100 --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);console.log(r.transactionHash+' status '+r.status+' gas '+parseInt(r.gasUsed)+' logs '+r.logs.length+' block '+parseInt(r.blockNumber))})")
echo "tx $TX"
MINT_BLOCK=${TX##* }
echo "balance(Anvil 3, batch 1) = $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$W_VALID" 1)"
echo "batch(1) = $(call "$REGISTRY" 'batch(uint256)((address,string,uint16,uint256,uint256))' 1)"
echo "Issued events in the log (topic0 $(cast sig-event 'Issued(uint256,address,address,string,uint16,uint256)')):"
cast logs --rpc-url "$RPC" --from-block "$MINT_BLOCK" --to-block latest --address "$REGISTRY" 'Issued(uint256 indexed batchId, address indexed issuer, address indexed to, string projectId, uint16 vintage, uint256 amount)' | grep -vE "^\s*(address|blockHash|blockNumber|logIndex|removed|transactionHash|transactionIndex)"

step "4. The minting gate refuses a wallet with no issuer credential (Anvil 9), even to an eligible recipient"
refuse "$STRANGER" "$REGISTRY" 'mint(address,string,uint16,uint256)' "$W_VALID" "VCS-1234" 2024 1
echo "(NotEligible($STRANGER, 100): the issuer gate said no)"

step "5. The holder gate refuses a mint into each of the four ineligible states (request 18)"
for pair in "NeverIssued:$W_NEVER" "Expired:$W_EXPIRED" "Revoked:$W_REVOKED" "WrongJurisdiction:$W_WRONG"; do
  name=${pair%%:*}; w=${pair#*:}
  echo "-- recipient $name ($w)"
  refuse "$ISSUER" "$REGISTRY" 'mint(address,string,uint16,uint256)' "$w" "VCS-1234" 2024 1
done
echo "batchCount still $(call "$REGISTRY" 'batchCount()(uint256)'): none of the four minted"

step "6. A transfer between two eligible holders lands; Anvil 9 is made Valid on 18 first"
send "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$STRANGER" $HOLDER_ID 1 >/dev/null
status "$STRANGER" $HOLDER_ID
send "$W_VALID" "$REGISTRY" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$W_VALID" "$STRANGER" 1 10 0x --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);console.log('tx '+r.transactionHash+' status '+r.status+' gas '+parseInt(r.gasUsed))})"
echo "balances: Anvil 3 $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$W_VALID" 1), Anvil 9 $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$STRANGER" 1)"

step "7. A transfer to a NeverIssued wallet and to a Revoked wallet is refused; the sender keeps the credits"
refuse "$W_VALID" "$REGISTRY" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$W_VALID" "$W_NEVER" 1 10 0x
refuse "$W_VALID" "$REGISTRY" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$W_VALID" "$W_REVOKED" 1 10 0x
echo "balance(Anvil 3, batch 1) still $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$W_VALID" 1)"

step "8. Anvil 3 retires 40 credits for FY26; the Retired event carries the project id and vintage for an indexer"
RTX=$(send "$W_VALID" "$REGISTRY" 'retire(uint256,uint256,address,string)' 1 40 0x0000000000000000000000000000000000000000 "FY26 offset" --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);console.log(r.transactionHash+' status '+r.status+' gas '+parseInt(r.gasUsed)+' block '+parseInt(r.blockNumber))})")
echo "tx $RTX"
RETIRE_BLOCK=${RTX##* }
echo "Retired events (topic0 $(cast sig-event 'Retired(uint256,address,address,string,uint16,uint256,string)')):"
cast logs --rpc-url "$RPC" --from-block "$RETIRE_BLOCK" --to-block latest --address "$REGISTRY" 'Retired(uint256 indexed batchId, address indexed holder, address indexed beneficiary, string projectId, uint16 vintage, uint256 amount, string reason)' | grep -vE "^\s*(address|blockHash|blockNumber|logIndex|removed|transactionHash|transactionIndex)"
echo "balance(Anvil 3) $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$W_VALID" 1)   outstanding(1) $(call "$REGISTRY" 'outstanding(uint256)(uint256)' 1)   batch(1) $(call "$REGISTRY" 'batch(uint256)((address,string,uint16,uint256,uint256))' 1)"

step "9. Retiring more than held is refused by the token, and the counter does not move"
refuse "$W_VALID" "$REGISTRY" 'retire(uint256,uint256,address,string)' 1 51 0x0000000000000000000000000000000000000000 "too much"
echo "batch(1).retired still $(call "$REGISTRY" 'batch(uint256)((address,string,uint16,uint256,uint256))' 1 | tr -d '\n')"

step "10. Anvil 9's credential expires; a lapsed holder can neither send nor retire (the policy stated in the contract)"
send "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$STRANGER" $HOLDER_ID 2 >/dev/null
status "$STRANGER" $HOLDER_ID
refuse "$STRANGER" "$REGISTRY" 'retire(uint256,uint256,address,string)' 1 1 0x0000000000000000000000000000000000000000 "lapsed"
refuse "$STRANGER" "$REGISTRY" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$STRANGER" "$W_VALID" 1 1 0x
echo "balance(Anvil 9) still $(call "$REGISTRY" 'balanceOf(address,uint256)(uint256)' "$STRANGER" 1): frozen, not lost"

step "11. The issuer's credential is revoked; the next mint is refused on request 100"
send "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$ISSUER" $ISSUER_ID 3 >/dev/null
status "$ISSUER" $ISSUER_ID
refuse "$ISSUER" "$REGISTRY" 'mint(address,string,uint16,uint256)' "$W_VALID" "VCS-1234" 2024 1

step "12. What the chain says at the end"
echo "batchCount $(call "$REGISTRY" 'batchCount()(uint256)'); batch(1) issued 100, retired 40, outstanding $(call "$REGISTRY" 'outstanding(uint256)(uint256)' 1); no function in the ABI decrements retired:"
(cd "$ROOT/contracts" && forge inspect src/CarbonCreditRegistry.sol:CarbonCreditRegistry abi --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const a=JSON.parse(s).filter(x=>x.type==='function'&&x.stateMutability!=='view'&&x.stateMutability!=='pure').map(x=>x.name).sort();console.log('  state-changing functions: '+a.join(', '))})")
echo "done"
