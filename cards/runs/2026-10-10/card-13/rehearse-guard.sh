#!/usr/bin/env bash
# Project 13: the guard's day on a local fork of Redbelly testnet. Nothing real is signed: the fork
# runs as chain 31337 and every sender is one of Anvil's unlocked test accounts (never 0 or 1, whose
# keys are public and which pass isAllowed on the real networks). The fork's permission contract,
# found through the registry, is swapped for the scaffold's test mock on the local chain only, so
# the rehearsal can decide who counts as verified; the real contract is untouched.
#
#   bash scripts/rehearse-guard.sh        needs forge, cast and anvil on PATH
set -u
PORT=8598; RPC=http://127.0.0.1:$PORT
anvil --port $PORT --chain-id 31337 --silent --fork-url https://governors.testnet.redbelly.network &
ANVIL=$!; trap 'kill $ANVIL 2>/dev/null' EXIT
for i in $(seq 1 30); do cast block-number --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done
echo "fork of testnet at block $(cast block-number --rpc-url $RPC), local chain id $(cast chain-id --rpc-url $RPC)"

ACC=$(cast rpc eth_accounts --rpc-url $RPC); A() { echo "$ACC" | python3 -c "import sys,json; print(json.load(sys.stdin)[$1])"; }
DEPLOYER=$(A 7); SENDER=$(A 2); FRIEND=$(A 3); STRANGER=$(A 4); S="--rpc-url $RPC --unlocked"
sig() { cast sig "$1" ; }
name() { case "$1" in
  "$(sig 'RecipientNotPermissioned(address)')") echo "RecipientNotPermissioned(to)";;
  "$(sig 'RecipientIsContract(address)')") echo "RecipientIsContract(to)";;
  "$(sig 'NativeTransferFailed(address)')") echo "NativeTransferFailed(to)";;
  "$(sig 'ZeroRecipient()')") echo "ZeroRecipient()";;
  "$(sig 'NothingToSend()')") echo "NothingToSend()";;
  *) echo "$1";; esac; }
q() { out=$("$@" 2>&1); if [ $? -eq 0 ]; then echo "   ok"; else echo "   REFUSED: $(name "$(echo "$out" | grep -oE 'custom error 0x[0-9a-f]{8}' | head -1 | cut -d' ' -f3)")"; fi; }
verdict() { case "$1" in 0) echo Permissioned;; 1) echo NotPermissioned;; 2) echo Contract;; 3) echo Zero;; *) echo "$1";; esac; }
check() { verdict "$(cast call $GUARD 'check(address)(uint8)' $1 --rpc-url $RPC)"; }

cd contracts
forge build >/dev/null 2>&1
REGISTRY=0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5
PERM=$(cast call $REGISTRY "getContractAddress(string)(address)" permission --rpc-url $RPC)
echo "0. the registry names the permission contract $PERM; on the fork it becomes the test mock"
cast rpc anvil_setCode $PERM "$(python3 -c "import json;print(json.load(open('out/RedbellyMocks.sol/PermissionMock.json'))['deployedBytecode']['object'])")" --rpc-url $RPC >/dev/null
for w in $SENDER $FRIEND; do cast send $PERM "setAllowed(address,bool)" $w true --from $DEPLOYER $S >/dev/null; done
echo "   sender and friend are marked verified; the stranger is not"

echo "1. deploy the guard (pre-flight first, then one contract with no admin and no roles)"
forge script script/DeployGuard.s.sol --rpc-url $RPC --sender $DEPLOYER --unlocked --broadcast 2>&1 | grep -E "chain id|RecipientGuard:|identity check" | sed 's/^ */   /'
GUARD=$(python3 -c "import json;print(json.load(open('deployments/31337-RecipientGuard.json'))['contract'])")

echo "2. check before sending: friend $(check $FRIEND), stranger $(check $STRANGER), the guard itself $(check $GUARD)"
echo "3. send 1 RBNT to the friend"; q cast send $GUARD "send(address,bool)" $FRIEND false --value 1ether --from $SENDER $S
echo "   friend now holds $(cast balance $FRIEND --rpc-url $RPC -e) RBNT"
echo "4. send 1 RBNT to the stranger (the typo that lands on an address nobody verified)"; q cast send $GUARD "send(address,bool)" $STRANGER false --value 1ether --from $SENDER $S
echo "   stranger still holds $(cast balance $STRANGER --rpc-url $RPC -e) RBNT; the sender's RBNT never left"
echo "5. send 1 RBNT to a contract without saying so"; q cast send $GUARD "send(address,bool)" $GUARD false --value 1ether --from $SENDER $S
echo "6. the same, saying so, to a contract that cannot receive RBNT"; q cast send $GUARD "send(address,bool)" $GUARD true --value 1ether --from $SENDER $S
echo "7. a token: the sender deploys one, approves the guard, sends 5 to the friend"
TOKEN=$(cast send --from $SENDER $S --json --create "$(python3 -c "import json;print(json.load(open('out/MockToken.sol/MockToken.json'))['bytecode']['object'])")" | python3 -c "import sys,json;print(json.load(sys.stdin)['contractAddress'])")
q cast send $TOKEN "approve(address,uint256)" $GUARD 10ether --from $SENDER $S; q cast send $GUARD "sendToken(address,address,uint256,bool)" $TOKEN $FRIEND 5ether false --from $SENDER $S
echo "   friend holds $(cast call $TOKEN 'balanceOf(address)(uint256)' $FRIEND --rpc-url $RPC | cut -d' ' -f1) of the token (5 whole units)"
echo "8. the same token to the stranger"; q cast send $GUARD "sendToken(address,address,uint256,bool)" $TOKEN $STRANGER 5ether false --from $SENDER $S
echo "9. the friend's verification is removed; 1 RBNT to the friend again"; cast send $PERM "setAllowed(address,bool)" $FRIEND false --from $DEPLOYER $S >/dev/null; q cast send $GUARD "send(address,bool)" $FRIEND false --value 1ether --from $SENDER $S
echo "   check now says: friend $(check $FRIEND)"
