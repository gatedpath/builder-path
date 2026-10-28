#!/usr/bin/env bash
# Card 11 rehearsal on the local fork that `npm run dev -- --no-web --port 8551 --request-id 708` leaves
# running. Every signer is an unlocked Anvil account (never 0 or 1); nothing here touches a real
# network and no key appears anywhere. Reads deployments/local.json for the seeded verifier and wallets.
# Save the output outside the project: transaction hashes are 64 hex characters, the shape of a key, and
# pre-flight's secret scanner reads every file in the tree, tracked or not.
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=${RPC:-http://127.0.0.1:8551}
LOCAL=deployments/local.json
j() { node -e "const d=require('./$LOCAL'); console.log($1)"; }
VERIFIER=$(j "d.verifier")
REQUEST=$(j "d.requestId")
DEPLOYER=$(j "d.deployer.address")
VALID=$(j "d.wallets.find(w=>w.state==='Valid').address")               # Anvil account 3
EXPIRED=$(j "d.wallets.find(w=>w.state==='Expired').address")           # Anvil account 4
REVOKED=$(j "d.wallets.find(w=>w.state==='Revoked').address")           # Anvil account 5
WRONG=$(j "d.wallets.find(w=>w.state==='WrongJurisdiction').address")   # Anvil account 6
ACCOUNTS=$(cast rpc eth_accounts --rpc-url "$RPC")
SECOND=$(node -e "console.log(JSON.parse(process.argv[1])[8])" "$ACCOUNTS")   # Anvil account 8: a second holder
SAFE=$(node -e "console.log(JSON.parse(process.argv[1])[9])" "$ACCOUNTS")     # Anvil account 9: stands in for the Safe
step() { echo; echo "== $*"; }
send() { # a mined revert has a receipt too (status 0x0): stop on it and print the trace, do not carry on as if it landed
  local r; r=$(cast send --rpc-url "$RPC" --unlocked --json "$@")
  echo "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(`status ${r.status} gas ${parseInt(r.gasUsed)} tx ${r.transactionHash}`)})'
  if [ "$(echo "$r" | jq -r .status)" != "0x1" ]; then echo "MINED BUT REVERTED; trace:"; cast run "$(echo "$r" | jq -r .transactionHash)" --rpc-url "$RPC" --quick 2>&1 | tail -25; exit 1; fi
}
refuse() { # expect a revert; print the decoded error and never exit the script
  if out=$(cast send --rpc-url "$RPC" --unlocked "$@" 2>&1); then echo "UNEXPECTED SUCCESS"; echo "$out"; exit 1; fi
  sel=$(echo "$out" | grep -oE '0x[0-9a-fA-F]{8,}' | head -1 || true)
  echo "refused: $(echo "$out" | grep -oE 'custom error 0x[0-9a-fA-F]{8}' | head -1) $(echo "$out" | grep -oE '[A-Za-z]+\([^)]*\)$' | head -1)"
  [ -n "$sel" ] && echo "   decoded: $(cast 4byte-decode "$sel" 2>/dev/null || cast 4byte "${sel:0:10}" 2>/dev/null || echo "$sel")"
}
bal() { cast call "$1" 'balanceOf(address)(uint256)' "$2" --rpc-url "$RPC"; }
jump() { cast rpc evm_increaseTime "$1" --rpc-url "$RPC" >/dev/null; cast rpc evm_mine --rpc-url "$RPC" >/dev/null; }
# a read after a time jump names the block just mined: eth_call at "latest" runs against Anvil's pending block, whose clock is not the mined block's
state() { cast call "$VOTE" 'state(uint256)(uint8)' "$1" --block "$(cast block-number --rpc-url "$RPC")" --rpc-url "$RPC"; }
ubal() { cast call "$UNITS" 'balanceOf(address,uint256)(uint256)' "$1" 1 --rpc-url "$RPC"; }

START=$(cast block-number --rpc-url "$RPC")   # eth_getLogs from block 0 on a fork is refused
echo "chain id $(cast chain-id --rpc-url "$RPC"); block $START"
echo "verifier (ReceptorMock) $VERIFIER, request id $REQUEST"
echo "deployer (Anvil 7) $DEPLOYER   Safe stand-in (Anvil 9) $SAFE   second holder (Anvil 8) $SECOND"
echo "Valid (Anvil 3) $VALID   Expired (4) $EXPIRED   Revoked (5) $REVOKED   WrongJurisdiction (6) $WRONG"

step "1. deploy the vehicle through its script: timelock (48 h), units, distributor, vote; the seeded mock as verifier"
(cd contracts && VERIFIER="$VERIFIER" REQUEST_ID="$REQUEST" ADMIN_SAFE="$SAFE" STABLE="" TIMELOCK="" RECORD_DEPLOYMENT=false \
  forge script script/DeployProperty.s.sol --rpc-url "$RPC" --sender "$DEPLOYER" --unlocked --broadcast 2>&1 \
  | grep -E "chain id|deployer|admin|ADMIN_SAFE|Safe|safe seat|STABLE|TimelockController:|PropertyUnits:|RentDistributor:|SaleVote:|verifier:|stable:|ONCHAIN EXECUTION COMPLETE|identity check")
RUN=contracts/broadcast/DeployProperty.s.sol/31337/run-latest.json
addr() { jq -r ".transactions[] | select(.contractName==\"$1\") | .contractAddress" "$RUN"; }
TIMELOCK=$(addr TimelockController); UNITS=$(addr PropertyUnits); RENT=$(addr RentDistributor); VOTE=$(addr SaleVote); STABLE=$(addr MockStable)
echo "units $UNITS requestId() = $(cast call "$UNITS" 'requestId()(uint64)' --rpc-url "$RPC"), CLOCK_MODE $(cast call "$UNITS" 'CLOCK_MODE()(string)' --rpc-url "$RPC")"
echo "rent  $RENT  requestId() = $(cast call "$RENT" 'requestId()(uint64)' --rpc-url "$RPC")"
echo "vote  $VOTE  requestId() = $(cast call "$VOTE" 'requestId()(uint64)' --rpc-url "$RPC")"
echo "timelock $TIMELOCK getMinDelay() = $(cast call "$TIMELOCK" 'getMinDelay()(uint256)' --rpc-url "$RPC") s; units admin is timelock: $(cast call "$UNITS" 'hasRole(bytes32,address)(bool)' "$ZERO" "$TIMELOCK" --rpc-url "$RPC"); deployer is admin: $(cast call "$UNITS" 'hasRole(bytes32,address)(bool)' "$ZERO" "$DEPLOYER" --rpc-url "$RPC")"
echo "Safe stand-in holds ISSUER_ROLE: $(cast call "$UNITS" 'hasRole(bytes32,address)(bool)' "$(cast keccak ISSUER_ROLE)" "$SAFE" --rpc-url "$RPC"), MANAGER_ROLE: $(cast call "$RENT" 'hasRole(bytes32,address)(bool)' "$(cast keccak MANAGER_ROLE)" "$SAFE" --rpc-url "$RPC"), PROPOSER_ROLE: $(cast call "$VOTE" 'hasRole(bytes32,address)(bool)' "$(cast keccak PROPOSER_ROLE)" "$SAFE" --rpc-url "$RPC")"

step "2. the Safe opens property 1 with 1,000 units and the hash of the offer document"
send --from "$SAFE" "$UNITS" 'openProperty(uint256,uint256,bytes32)' 1 1000 "$(cast keccak 'offer document 2026-10-17')"

step "3. the second holder (Anvil 8) is made Valid for request $REQUEST on the mock; 600 units to Anvil 3, 400 to Anvil 8"
send --from "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$SECOND" "$REQUEST" 1
send --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$VALID" 600
send --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$SECOND" 400
echo "balances: Anvil 3 $(ubal "$VALID"), Anvil 8 $(ubal "$SECOND"), totalSupply(1) $(cast call "$UNITS" 'totalSupply(uint256)(uint256)' 1 --rpc-url "$RPC")"

step "4. mint gate: issue into Expired, Revoked, WrongJurisdiction and NeverIssued wallets, each refused"
refuse --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$EXPIRED" 1
refuse --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$REVOKED" 1
refuse --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$WRONG" 1
refuse --from "$SAFE" "$UNITS" 'issue(uint256,address,uint256)' 1 "$(j "d.wallets.find(w=>w.state==='NeverIssued').address")" 1

step "5. transfer gate: Anvil 3 sends 100 units to Anvil 8 (both Valid), then tries a Revoked recipient"
send --from "$VALID" "$UNITS" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$VALID" "$SECOND" 1 100 0x
refuse --from "$VALID" "$UNITS" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$VALID" "$REVOKED" 1 1 0x
echo "balances: Anvil 3 $(ubal "$VALID"), Anvil 8 $(ubal "$SECOND")"

step "6. rent: the Safe gets 100,000 mUSD, approves the distributor and deposits 10,000 mUSD for property 1"
send --from "$DEPLOYER" "$STABLE" 'mint(address,uint256)' "$SAFE" 100000000000
send --from "$SAFE" "$STABLE" 'approve(address,uint256)' "$RENT" 100000000000
send --from "$SAFE" "$RENT" 'deposit(uint256,uint256)' 1 10000000000
echo "round 1: $(cast call "$RENT" 'round(uint256)((uint256,uint256,uint48,uint256,uint256))' 1 --rpc-url "$RPC")"
echo "claimable: Anvil 3 (500 units) $(cast call "$RENT" 'claimable(uint256,address)(uint256)' 1 "$VALID" --rpc-url "$RPC"), Anvil 8 (500 units) $(cast call "$RENT" 'claimable(uint256,address)(uint256)' 1 "$SECOND" --rpc-url "$RPC")"

step "7. Anvil 3 claims; Anvil 8's credential is revoked and the claim is refused; restored, it pays"
send --from "$VALID" "$RENT" 'claim(uint256)' 1
echo "Anvil 3 mUSD $(bal "$STABLE" "$VALID")"
send --from "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$SECOND" "$REQUEST" 3
refuse --from "$SECOND" "$RENT" 'claim(uint256)' 1
send --from "$DEPLOYER" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$SECOND" "$REQUEST" 1
send --from "$SECOND" "$RENT" 'claim(uint256)' 1
echo "Anvil 8 mUSD $(bal "$STABLE" "$SECOND"); unclaimed(1) = $(cast call "$RENT" 'unclaimed(uint256)(uint256)' 1 --rpc-url "$RPC"); a second claim:"
refuse --from "$VALID" "$RENT" 'claim(uint256)' 1
echo "RentClaimed events:"
cast logs --rpc-url "$RPC" --from-block "$START" --address "$RENT" 'RentClaimed(uint256 indexed,address indexed,uint256,uint256)' | head -16

step "8. the vote: the Safe proposes a sale (7 days); Anvil 3 votes for with 500 units, Anvil 8 against with 500: not a majority"
send --from "$SAFE" "$VOTE" 'propose(uint256,bytes32,uint48)' 1 "$(cast keccak 'sale terms 2026-10-17')" 604800
echo "state(1) = $(state 1) (0 = Active)"
send --from "$VALID" "$VOTE" 'castVote(uint256,bool)' 1 true
send --from "$SECOND" "$VOTE" 'castVote(uint256,bool)' 1 false
refuse --from "$VALID" "$VOTE" 'castVote(uint256,bool)' 1 true
refuse --from "$REVOKED" "$VOTE" 'castVote(uint256,bool)' 1 true
jump 604800
echo "after the deadline: state(1) = $(state 1) (2 = Defeated); proposal: $(cast call "$VOTE" 'proposal(uint256)((uint256,bytes32,uint48,uint48,uint256,uint256,uint256))' 1 --rpc-url "$RPC")"

step "9. a second proposal: Anvil 8 sends 100 units to Anvil 3 in the proposal's own second; Anvil 3 still votes with 500"
send --from "$SAFE" "$VOTE" 'propose(uint256,bytes32,uint48)' 1 "$(cast keccak 'sale terms v2')" 604800
send --from "$SECOND" "$UNITS" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$SECOND" "$VALID" 1 100 0x
send --from "$VALID" "$VOTE" 'castVote(uint256,bool)' 2 true
echo "Anvil 3 voted with: $(cast call "$VOTE" 'proposal(uint256)((uint256,bytes32,uint48,uint48,uint256,uint256,uint256))' 2 --rpc-url "$RPC" | tr ',' '\n' | sed -n 6p) units (held 500 at the snapshot, holds $(ubal "$VALID") now)"
jump 604800
echo "state(2) = $(state 2) (2 = Defeated: 500 of 1,000 is not a majority; 1 would be Passed)"

step "10. admin behind the timelock: the Safe cannot change the request id directly; it schedules it; execution before 48 h is refused"
refuse --from "$SAFE" "$UNITS" 'setRequestId(uint64)' 18
DATA=$(cast calldata 'setRequestId(uint64)' 18)
ZERO=$(cast hash-zero)   # bytes32(0) as the predecessor; written this way because a literal of 64 zeros has the shape of a key to pre-flight's scanner
SALT=$(cast keccak 'rid-1')
send --from "$SAFE" "$TIMELOCK" 'schedule(address,uint256,bytes,bytes32,bytes32,uint256)' "$UNITS" 0 "$DATA" "$ZERO" "$SALT" 172800
refuse --from "$SAFE" "$TIMELOCK" 'execute(address,uint256,bytes,bytes32,bytes32)' "$UNITS" 0 "$DATA" "$ZERO" "$SALT"
jump 172740
echo "at 47 h 59 min:"
refuse --from "$SAFE" "$TIMELOCK" 'execute(address,uint256,bytes,bytes32,bytes32)' "$UNITS" 0 "$DATA" "$ZERO" "$SALT"
jump 60
echo "at 48 h:"
send --from "$SAFE" "$TIMELOCK" 'execute(address,uint256,bytes,bytes32,bytes32)' "$UNITS" 0 "$DATA" "$ZERO" "$SALT"
echo "units requestId() = $(cast call "$UNITS" 'requestId()(uint64)' --rpc-url "$RPC"); a stranger cannot schedule:"
refuse --from "$SECOND" "$TIMELOCK" 'schedule(address,uint256,bytes,bytes32,bytes32,uint256)' "$UNITS" 0 "$DATA" "$ZERO" "$(cast keccak 'rid-2')" 172800

step "11. hold gate after the change: the gate is now request 18, which nobody here has; a transfer is refused and the units stay"
refuse --from "$VALID" "$UNITS" 'safeTransferFrom(address,address,uint256,uint256,bytes)' "$VALID" "$SECOND" 1 1 0x
echo "Anvil 3 still holds $(ubal "$VALID") units"
echo; echo "done: every signer was an unlocked Anvil account on chain $(cast chain-id --rpc-url "$RPC"); nothing was signed on a real network"
