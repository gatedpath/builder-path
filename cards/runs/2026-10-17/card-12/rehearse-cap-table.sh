#!/usr/bin/env bash
# Card 12 rehearsal on the local fork that `npm run dev -- --no-web --port 8552` leaves running.
# Every signer is an unlocked Anvil account (never 0 or 1); nothing here touches a real network and
# no key appears anywhere. Reads deployments/local.json for the register, the seeded verifier and
# the five wallets, and the broadcast record for the vault.
# Save the output outside the project: transaction hashes are 64 hex characters, the shape of a key,
# and pre-flight's secret scanner reads every file in the tree, tracked or not.
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=${RPC:-http://127.0.0.1:8552}
LOCAL=deployments/local.json
j() { node -e "const d=require('./$LOCAL'); console.log($1)"; }
VERIFIER=$(j "d.verifier")
REGISTER=$(j "d.contract")
BOARD=$(j "d.deployer.address")                                            # Anvil account 7: deployer, admin and board on the local loop
NEVER=$(j "d.wallets.find(w=>w.state==='NeverIssued').address")           # Anvil account 2
FOUNDER=$(j "d.wallets.find(w=>w.state==='Valid').address")               # Anvil account 3
REVOKED=$(j "d.wallets.find(w=>w.state==='Revoked').address")             # Anvil account 5
WRONGJ=$(j "d.wallets.find(w=>w.state==='WrongJurisdiction').address")    # Anvil account 6
ACCOUNTS=$(cast rpc eth_accounts --rpc-url "$RPC")
EMPLOYEE=$(node -e "console.log(JSON.parse(process.argv[1])[8])" "$ACCOUNTS")   # Anvil account 8
INVESTOR=$(node -e "console.log(JSON.parse(process.argv[1])[9])" "$ACCOUNTS")   # Anvil account 9
VAULT=$(jq -r '.transactions[] | select(.contractName=="VestingVault") | .contractAddress' contracts/broadcast/Deploy.s.sol/31337/run-latest.json)
ORDINARY=1; SERIES_A=2
step() { echo; echo "== $*"; }
c() { cast call --rpc-url "$RPC" "$@"; }
send() { cast send --rpc-url "$RPC" --unlocked --json "$@" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(`status ${r.status} gas ${parseInt(r.gasUsed)} block ${parseInt(r.blockNumber)}`)})'; }
# The errors the two contracts and the kit name, so a refusal is decoded to its name and arguments
# (cast knows none of them; card 8 found the `data:` field is the one to read, not the bare selector).
ERRORS=(
  "NotEligible(address,uint64)" "AccessControlUnauthorizedAccount(address,bytes32)" "ExceedsAuthorised(uint256,uint256,uint256)"
  "InsufficientShares(uint256,address,uint256,uint256)" "WrongStatus(uint256,uint8,uint8)" "NothingVested(uint256)"
  "NotBoard(address)" "NotTheBeneficiary(uint256,address)" "SelfTransfer()" "EmptyResolution()" "NoSuchClass(uint256)"
)
refuse() { # expect a revert; print the decoded error and never exit the script
  if out=$(cast send --rpc-url "$RPC" --unlocked "$@" 2>&1); then echo "UNEXPECTED SUCCESS"; echo "$out"; exit 1; fi
  data=$(echo "$out" | grep -oE 'data: "0x[0-9a-fA-F]+"' | grep -oE '0x[0-9a-fA-F]+' | head -1 || true)
  [ -z "$data" ] && data=$(echo "$out" | grep -oE '0x[0-9a-fA-F]{8,}' | head -1 || true)
  sel=${data:0:10}
  for sig in "${ERRORS[@]}"; do
    if [ "$(cast sig "$sig")" = "$sel" ]; then
      args=${sig#*(}; args=${args%)}   # decode the words after the selector as if they were return values
      [ -n "$args" ] && dec=$(cast abi-decode "f()($args)" "0x${data:10}" 2>/dev/null | tr '\n' ' ') || dec=""
      echo "refused: ${sig%%(*}($dec)"; return; fi
  done
  echo "refused: $(echo "$out" | grep -oE 'execution reverted[^,]*' | head -1) $data"
}
balance() { c "$REGISTER" 'balanceOf(uint256,address)(uint256)' "$1" "$2"; }
class() { c "$REGISTER" 'shareClass(uint256)((string,uint64,uint256,uint256))' "$1"; }
setstatus() { send --from "$BOARD" "$VERIFIER" 'setStatus(address,uint64,uint8)' "$1" "$2" "$3" >/dev/null; }

START=$(cast block-number --rpc-url "$RPC")
echo "chain id $(cast chain-id --rpc-url "$RPC"); block $START"
echo "CapTable $REGISTER   VestingVault $VAULT   verifier (ReceptorMock) $VERIFIER"
echo "board, admin and deployer (Anvil 7) $BOARD"
echo "founder, Valid on 18 (Anvil 3) $FOUNDER   employee (Anvil 8) $EMPLOYEE   investor (Anvil 9) $INVESTOR"
echo "NeverIssued on 18 (Anvil 2) $NEVER   Revoked on 18 (Anvil 5) $REVOKED   WrongJurisdiction on 18 (Anvil 6) $WRONGJ"

step "1. the register as deployed: two classes, each with its own request id"
echo "class 1 $(class 1)"
echo "class 2 $(class 2)"
echo "requestId() for the loop = $(c "$REGISTER" 'requestId()(uint64)'); vault has NOMINEE_ROLE: $(c "$REGISTER" 'hasRole(bytes32,address)(bool)' "$(cast keccak NOMINEE_ROLE)" "$VAULT")"

step "2. the board issues 6,000,000 Ordinary to the founder (gate: request 18, wallet is Valid)"
send --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $ORDINARY "$FOUNDER" 6000000
echo "founder holds $(balance $ORDINARY "$FOUNDER") Ordinary; class 1 now $(class 1)"

step "3. refusals on the Ordinary gate: NeverIssued, Revoked and WrongJurisdiction wallets"
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $ORDINARY "$NEVER" 1000
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $ORDINARY "$REVOKED" 1000
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $ORDINARY "$WRONGJ" 1000

step "4. the wrong class: the founder is Valid on 18 and holds nothing for 708, so Series A is refused"
echo "isEligibleFor(1, founder) = $(c "$REGISTER" 'isEligibleFor(uint256,address)(bool)' $ORDINARY "$FOUNDER"); isEligibleFor(2, founder) = $(c "$REGISTER" 'isEligibleFor(uint256,address)(bool)' $SERIES_A "$FOUNDER")"
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $SERIES_A "$FOUNDER" 1000

step "5. seed the investor gate (request 708): account 9 Valid, account 2 Valid, account 6 Revoked; account 8 Valid on 18 as the employee"
setstatus "$INVESTOR" 708 1; setstatus "$NEVER" 708 1; setstatus "$WRONGJ" 708 3; setstatus "$EMPLOYEE" 18 1
echo "account 2 is NeverIssued on 18 and Valid on 708: a wallet of the other class"

step "6. the board issues 1,000,000 Series A to the investor; the investor cannot be issued Ordinary"
send --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $SERIES_A "$INVESTOR" 1000000
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $ORDINARY "$INVESTOR" 1000
echo "investor holds $(balance $SERIES_A "$INVESTOR") Series A and $(balance $ORDINARY "$INVESTOR") Ordinary"

step "7. refusal: the authorised cap on Series A (2,000,000) is hit"
refuse --from "$BOARD" "$REGISTER" 'issue(uint256,address,uint256)' $SERIES_A "$INVESTOR" 1000001

step "8. vesting: the board grants the employee 48,000 Ordinary over four years with a one-year cliff"
NOW=$(cast block --rpc-url "$RPC" latest -f timestamp)
send --from "$BOARD" "$VAULT" 'grant(uint256,address,uint256,uint64,uint64,uint64)' $ORDINARY "$EMPLOYEE" 48000 "$NOW" 31536000 126144000
echo "vault holds $(balance $ORDINARY "$VAULT") Ordinary for the employee; employee holds $(balance $ORDINARY "$EMPLOYEE"); releasable(1) = $(c "$VAULT" 'releasable(uint256)(uint256)' 1)"
echo "refusal: a grant to the investor, Valid on 708 only"
refuse --from "$BOARD" "$VAULT" 'grant(uint256,address,uint256,uint64,uint64,uint64)' $ORDINARY "$INVESTOR" 1000 "$NOW" 0 31536000
echo "refusal: the founder (not on the board) tries to grant"
refuse --from "$FOUNDER" "$VAULT" 'grant(uint256,address,uint256,uint64,uint64,uint64)' $ORDINARY "$FOUNDER" 1000 "$NOW" 0 31536000

step "9. release before the cliff: refused"
refuse --from "$EMPLOYEE" "$VAULT" 'release(uint256)' 1

step "10. one year passes on the fork (evm_increaseTime); release at the cliff: a quarter"
cast rpc --rpc-url "$RPC" evm_increaseTime 31536000 >/dev/null; cast rpc --rpc-url "$RPC" evm_mine >/dev/null
echo "releasable(1) = $(c "$VAULT" 'releasable(uint256)(uint256)' 1)"
send --from "$EMPLOYEE" "$VAULT" 'release(uint256)' 1
echo "employee holds $(balance $ORDINARY "$EMPLOYEE") Ordinary; vault holds $(balance $ORDINARY "$VAULT")"

step "11. the employee's credential is revoked; the next release waits in the vault"
cast rpc --rpc-url "$RPC" evm_increaseTime 31536000 >/dev/null; cast rpc --rpc-url "$RPC" evm_mine >/dev/null
setstatus "$EMPLOYEE" 18 3
echo "releasable(1) = $(c "$VAULT" 'releasable(uint256)(uint256)' 1) (vested, but the gate decides)"
refuse --from "$EMPLOYEE" "$VAULT" 'release(uint256)' 1
setstatus "$EMPLOYEE" 18 1
echo "credential restored"
send --from "$EMPLOYEE" "$VAULT" 'release(uint256)' 1
echo "employee holds $(balance $ORDINARY "$EMPLOYEE") Ordinary after two years"

step "12. the board revokes the schedule at two years: 24,000 cancelled, the register's issued count falls"
send --from "$BOARD" "$VAULT" 'revoke(uint256,string)' 1 "left the company; board minute 2026-10-17/4"
echo "class 1 $(class 1); vault holds $(balance $ORDINARY "$VAULT"); schedule(1) = $(c "$VAULT" 'schedule(uint256)((uint256,address,uint256,uint256,uint64,uint64,uint64,bool))' 1)"

step "13. a transfer: the investor asks to move 250,000 Series A to account 2 (Valid on 708)"
send --from "$INVESTOR" "$REGISTER" 'requestTransfer(uint256,address,uint256)' $SERIES_A "$NEVER" 250000
echo "canApprove(1) = $(c "$REGISTER" 'canApprove(uint256)(bool)' 1); investor still holds $(balance $SERIES_A "$INVESTOR")"
echo "refusal: the founder tries to approve; refusal: the investor tries to approve their own"
refuse --from "$FOUNDER" "$REGISTER" 'approveTransfer(uint256,string)' 1 "minute"
refuse --from "$INVESTOR" "$REGISTER" 'approveTransfer(uint256,string)' 1 "minute"
echo "the board approves with its minute reference"
send --from "$BOARD" "$REGISTER" 'approveTransfer(uint256,string)' 1 "board minute 2026-10-17/5: transfer approved"
echo "investor holds $(balance $SERIES_A "$INVESTOR"); account 2 holds $(balance $SERIES_A "$NEVER") Series A (and $(balance $ORDINARY "$NEVER") Ordinary)"
echo "transferRequest(1) = $(c "$REGISTER" 'transferRequest(uint256)((uint256,address,address,uint256,uint8,string))' 1)"
refuse --from "$BOARD" "$REGISTER" 'approveTransfer(uint256,string)' 1 "again"

step "14. a transfer to a wallet Revoked on 708: the request is taken, the approval is refused"
send --from "$INVESTOR" "$REGISTER" 'requestTransfer(uint256,address,uint256)' $SERIES_A "$WRONGJ" 1000
echo "canApprove(2) = $(c "$REGISTER" 'canApprove(uint256)(bool)' 2)"
refuse --from "$BOARD" "$REGISTER" 'approveTransfer(uint256,string)' 2 "minute"
send --from "$BOARD" "$REGISTER" 'rejectTransfer(uint256,string)' 2 "recipient holds no valid wholesale investor credential"

step "15. a holder cannot move shares alone: the founder asks and withdraws; nothing moves"
send --from "$FOUNDER" "$REGISTER" 'requestTransfer(uint256,address,uint256)' $ORDINARY "$EMPLOYEE" 100000
send --from "$FOUNDER" "$REGISTER" 'cancelTransfer(uint256)' 3
echo "founder holds $(balance $ORDINARY "$FOUNDER"); employee holds $(balance $ORDINARY "$EMPLOYEE")"

step "16. the register from the log: every TransferApproved since block $START"
cast logs --rpc-url "$RPC" --from-block "$START" --address "$REGISTER" 'TransferApproved(uint256 indexed,address indexed,string)' | grep -vE "^\s*(transactionHash|transactionIndex|blockHash|logIndex|removed|address):"
echo
echo "done: 6,000,000 Ordinary and 1,000,000 Series A issued, 48,000 granted on a schedule, 24,000 released and 24,000 cancelled, 250,000 Series A transferred with the board's minute, 15 refusals each with its name."
