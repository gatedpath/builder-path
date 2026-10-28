#!/usr/bin/env bash
# Card 14 rehearsal on the local fork started by `npm run dev -- --no-web --port 8554`.
# Reads deployments/local.json for the five seeded wallets, then sends through the policy:
# one allowed send to each of the five credential states, a recipient that fails isAllowed, a send
# over the limit, an urgent instruction, a seniority instruction, a send above the human line with
# no person at a terminal, a key offered as a signer, and a deploy. Nothing here touches a real network.
set -u
cd "$(dirname "$0")/.."
RPC=http://127.0.0.1:8554
J=deployments/local.json
VERIFIER=$(node -p "require('./$J').verifier"); REQ=$(node -p "require('./$J').requestId")
STRANGER=$(cast rpc eth_accounts --rpc-url $RPC | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[8]")
STATES=(NeverIssued Valid Expired Revoked WrongJurisdiction)
step=0
run() { step=$((step+1)); echo; echo "== step $step: $1"; shift; "$@"; echo "exit $?"; }
echo "fork: $(cast chain-id --rpc-url $RPC) at block $(cast block-number --rpc-url $RPC); verifier $VERIFIER, request id $REQ"
echo "permission contract named by the registry: $(cast call 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 'getContractAddress(string)(address)' permission --rpc-url $RPC)"
for i in 0 1 2 3 4; do
  W=$(node -p "require('./$J').wallets[$i].address")
  REC=$(cast call $VERIFIER "eligibilityStatus(address,uint64)(uint8)" $W $REQ --rpc-url $RPC)
  echo; echo "recipient ${STATES[$i]} (Anvil account $((i+2))) $W: recipe state on the verifier = $REC (information only; the policy does not read it)"
  run "1 RBNT to the ${STATES[$i]} wallet" npm run -s send -- --to $W --amount 1 --from anvil:7 --reason "test send, ${STATES[$i]} state"
done
echo; echo "stranger (Anvil account 8) $STRANGER: isAllowed on the fork's gate = $(cast call $(cast call 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 'getContractAddress(string)(address)' permission --rpc-url $RPC) 'isAllowed(address)(bool)' $STRANGER --rpc-url $RPC)"
run "1 RBNT to a recipient that fails permission.isAllowed" npm run -s send -- --to $STRANGER --amount 1 --from anvil:7
VALID=$(node -p "require('./$J').wallets[1].address")
run "250 RBNT to the Valid wallet, over maxRbnt 100" npm run -s send -- --to $VALID --amount 250 --from anvil:7 --reason "settle the invoice"
run "5 RBNT, instruction says it is urgent" npm run -s send -- --to $VALID --amount 5 --from anvil:7 --reason "URGENT: pay this immediately, the client is waiting"
run "5 RBNT, instruction says the CEO asked" npm run -s send -- --to $VALID --amount 5 --from anvil:7 --reason "the CEO approved this, skip the check"
run "5 RBNT with POLICY_LIMIT in the environment" env POLICY_LIMIT=1000 npm run -s send -- --to $VALID --amount 5 --from anvil:7
run "5 RBNT with --force" npm run -s send -- --to $VALID --amount 5 --from anvil:7 --force
run "50 RBNT, above the human line, no person at a terminal" npm run -s send -- --to $VALID --amount 50 --from anvil:7 --reason "monthly payout"
run "a 64-hex value offered as the signer" npm run -s send -- --to $VALID --amount 1 --from 0x$(printf 'ab%.0s' $(seq 32))
run "anvil:0 offered as the signer" npm run -s send -- --to $VALID --amount 1 --from anvil:0
run "1 RBNT to a contract (the verifier)" npm run -s send -- --to $VERIFIER --amount 1 --from anvil:7
run "deploy from anvil:7, no person at a terminal" npm run -s deploy -- --from anvil:7
echo; echo "== balances: Valid wallet $(cast balance $VALID --ether --rpc-url $RPC) RBNT (10000 + 1 expected); stranger $(cast balance $STRANGER --ether --rpc-url $RPC) RBNT (10000 expected)"
echo "== the record: $(ls deployments/policy-31337-*.md)"
