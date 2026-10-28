#!/usr/bin/env bash
# Card 9 rehearsal on the local fork that `npm run dev -- --no-web --port 8549 --request-id 100` leaves
# running. Every signer is an unlocked Anvil account (never 0 or 1); nothing here touches a real
# network and no key appears anywhere. Reads deployments/local.json for the seeded verifier and wallets.
# Save the output outside the project: transaction hashes are 64 hex characters, the shape of a key, and
# pre-flight's secret scanner reads every file in the tree, tracked or not.
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=${RPC:-http://127.0.0.1:8549}
LOCAL=deployments/local.json
j() { node -e "const d=require('./$LOCAL'); console.log($1)"; }
VERIFIER=$(j "d.verifier")
REQUEST=$(j "d.requestId")
DEPLOYER=$(j "d.deployer.address")
GRANTEE=$(j "d.wallets.find(w=>w.state==='Valid').address")           # Anvil account 3
REVOKED=$(j "d.wallets.find(w=>w.state==='Revoked').address")         # Anvil account 5
ACCOUNTS=$(cast rpc eth_accounts --rpc-url "$RPC")
FUNDER=$(node -e "console.log(JSON.parse(process.argv[1])[8])" "$ACCOUNTS")   # Anvil account 8
REVIEWER=$(node -e "console.log(JSON.parse(process.argv[1])[9])" "$ACCOUNTS") # Anvil account 9
step() { echo; echo "== $*"; }
send() { cast send --rpc-url "$RPC" --unlocked --json "$@" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(`status ${r.status} gas ${parseInt(r.gasUsed)} tx ${r.transactionHash}`)})'; }
refuse() { # expect a revert; print the decoded error and never exit the script
  if out=$(cast send --rpc-url "$RPC" --unlocked "$@" 2>&1); then echo "UNEXPECTED SUCCESS"; echo "$out"; exit 1; fi
  sel=$(echo "$out" | grep -oE '0x[0-9a-fA-F]{8,}' | head -1 || true)
  echo "refused: $(echo "$out" | grep -oE 'custom error 0x[0-9a-fA-F]{8}' | head -1) $(echo "$out" | grep -oE '[A-Za-z]+\([^)]*\)$' | head -1)"
  [ -n "$sel" ] && echo "   decoded: $(cast 4byte-decode "$sel" 2>/dev/null || cast 4byte "${sel:0:10}" 2>/dev/null || echo "$sel")"
}

START=$(cast block-number --rpc-url "$RPC")   # eth_getLogs from block 0 on a fork is refused: "requested too large block range"
echo "chain id $(cast chain-id --rpc-url "$RPC"); block $START"
echo "verifier (ReceptorMock) $VERIFIER, request id $REQUEST"
echo "deployer/admin (Anvil 7) $DEPLOYER"
echo "funder (Anvil 8) $FUNDER   reviewer (Anvil 9) $REVIEWER"
echo "grantee, Valid (Anvil 3) $GRANTEE   a Revoked wallet (Anvil 5) $REVOKED"

step "1. deploy the mock stablecoin (tests and rehearsal only)"
STABLE=$(cast send --rpc-url "$RPC" --unlocked --from "$DEPLOYER" --json --create "$(jq -r .bytecode.object contracts/out/MockStable.sol/MockStable.json)" | jq -r .contractAddress)
echo "MockStable $STABLE, $(cast call "$STABLE" 'symbol()(string)' --rpc-url "$RPC"), $(cast call "$STABLE" 'decimals()(uint8)' --rpc-url "$RPC") decimals"

step "2. deploy GrantEscrow through its deploy script, pointed at the seeded verifier"
(cd contracts && VERIFIER="$VERIFIER" REQUEST_ID="$REQUEST" REVIEWER="$REVIEWER" ADMIN_SAFE="" RECORD_DEPLOYMENT=false \
  forge script script/DeployGrantEscrow.s.sol --rpc-url "$RPC" --sender "$DEPLOYER" --unlocked --broadcast 2>&1 | grep -E "chain id|deployer|admin|GrantEscrow:|verifier:|reviewer:|ONCHAIN EXECUTION COMPLETE|identity check")
ESCROW=$(jq -r '.transactions[] | select(.contractName=="GrantEscrow") | .contractAddress' contracts/broadcast/DeployGrantEscrow.s.sol/31337/run-latest.json)
echo "GrantEscrow $ESCROW; requestId() = $(cast call "$ESCROW" 'requestId()(uint64)' --rpc-url "$RPC"); reviewer has REVIEWER_ROLE: $(cast call "$ESCROW" 'hasRole(bytes32,address)(bool)' "$(cast keccak REVIEWER_ROLE)" "$REVIEWER" --rpc-url "$RPC")"

step "3. the funder gets 100,000 mUSD and approves the escrow"
send --from "$DEPLOYER" "$STABLE" 'mint(address,uint256)' "$FUNDER" 100000000000
send --from "$FUNDER" "$STABLE" 'approve(address,uint256)' "$ESCROW" 100000000000

step "4. deposit: 30,000 mUSD for the Valid grantee in three tranches (10,000 / 15,000 / 5,000)"
send --from "$FUNDER" "$ESCROW" 'fund(address,address,uint256,uint256[])' "$GRANTEE" "$STABLE" 30000000000 '[10000000000,15000000000,5000000000]'
echo "escrow holds $(cast call "$STABLE" 'balanceOf(address)(uint256)' "$ESCROW" --rpc-url "$RPC"); remainder(1) = $(cast call "$ESCROW" 'remainder(uint256)(uint256)' 1 --rpc-url "$RPC"); canRelease(1) = $(cast call "$ESCROW" 'canRelease(uint256)(bool)' 1 --rpc-url "$RPC")"

step "5. refusal: the reviewer tries to release before the grantee has accepted"
refuse --from "$REVIEWER" "$ESCROW" 'release(uint256,string)' 1 "milestone 1"

step "6. the grantee proves eligibility and accepts (gate: request $REQUEST, wallet is Valid)"
send --from "$GRANTEE" "$ESCROW" 'accept(uint256)' 1
echo "canRelease(1) = $(cast call "$ESCROW" 'canRelease(uint256)(bool)' 1 --rpc-url "$RPC")"

step "7. refusal: the funder (not a reviewer) tries to release"
refuse --from "$FUNDER" "$ESCROW" 'release(uint256,string)' 1 "I am the funder, pay them"

step "8. release tranche 1 with its note"
send --from "$REVIEWER" "$ESCROW" 'release(uint256,string)' 1 "milestone 1: repository public, CI green"
step "9. release tranche 2 with its note"
send --from "$REVIEWER" "$ESCROW" 'release(uint256,string)' 1 "milestone 2: testnet deploy verified on Routescan"
echo "grantee balance $(cast call "$STABLE" 'balanceOf(address)(uint256)' "$GRANTEE" --rpc-url "$RPC"); remainder(1) = $(cast call "$ESCROW" 'remainder(uint256)(uint256)' 1 --rpc-url "$RPC")"
echo "notes read back from the contract:"
cast call "$ESCROW" 'milestone(uint256,uint256)((uint256,bool,string))' 1 0 --rpc-url "$RPC"
cast call "$ESCROW" 'milestone(uint256,uint256)((uint256,bool,string))' 1 1 --rpc-url "$RPC"
cast call "$ESCROW" 'milestone(uint256,uint256)((uint256,bool,string))' 1 2 --rpc-url "$RPC"
echo "Released events on the log:"
cast logs --rpc-url "$RPC" --from-block "$START" --address "$ESCROW" 'Released(uint256 indexed,uint256 indexed,uint256,string,address)' | grep -E "topics|data" | head -8

step "10. refusal: a second grant for a wallet whose credential is Revoked; its accept fails the gate"
send --from "$FUNDER" "$ESCROW" 'fund(address,address,uint256,uint256[])' "$REVOKED" "$STABLE" 2000000000 '[2000000000]'
refuse --from "$REVOKED" "$ESCROW" 'accept(uint256)' 2

step "11. the remainder: the reviewer cancels grant 2 and the 2,000 mUSD goes back to the funder"
BEFORE=$(cast call "$STABLE" 'balanceOf(address)(uint256)' "$FUNDER" --rpc-url "$RPC")
send --from "$REVIEWER" "$ESCROW" 'cancel(uint256,string)' 2 "grantee cannot pass the gate; grant withdrawn"
AFTER=$(cast call "$STABLE" 'balanceOf(address)(uint256)' "$FUNDER" --rpc-url "$RPC")
echo "funder before $BEFORE after $AFTER; remainder(2) = $(cast call "$ESCROW" 'remainder(uint256)(uint256)' 2 --rpc-url "$RPC")"

step "12. the grantee's credential is revoked after two tranches: the third waits in the escrow"
send --from "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$GRANTEE" "$REQUEST" 3
refuse --from "$REVIEWER" "$ESCROW" 'release(uint256,string)' 1 "milestone 3: final report"
echo "escrow still holds $(cast call "$STABLE" 'balanceOf(address)(uint256)' "$ESCROW" --rpc-url "$RPC") (grant 1's remainder, 5,000 mUSD)"
echo
echo "done: 30,000 deposited, 25,000 released in two tranches with notes, 2,000 returned to the funder, 5,000 held."
