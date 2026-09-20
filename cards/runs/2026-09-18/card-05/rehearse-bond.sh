#!/usr/bin/env bash
# Project 5: the bond's life on a local fork of Redbelly testnet. Nothing real is signed: the fork
# runs as chain 31337 and every sender is one of Anvil's unlocked test accounts (never 0 or 1, whose
# keys are public and which pass isAllowed on the real networks).
#
#   bash scripts/rehearse-bond.sh        needs forge, cast and anvil on PATH
set -u
PORT=8599; RPC=http://127.0.0.1:$PORT
anvil --port $PORT --chain-id 31337 --silent --fork-url https://governors.testnet.redbelly.network &
ANVIL=$!; trap 'kill $ANVIL 2>/dev/null' EXIT
for i in $(seq 1 30); do cast block-number --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done
echo "fork of testnet at block $(cast block-number --rpc-url $RPC), local chain id $(cast chain-id --rpc-url $RPC)"

ACC=$(cast rpc eth_accounts --rpc-url $RPC); A() { echo "$ACC" | python3 -c "import sys,json; print(json.load(sys.stdin)[$1])"; }
ADMIN=$(A 7); INVESTOR=$(A 2); OUTSIDER=$(A 3); S="--rpc-url $RPC --unlocked"
name() { case "$1" in 0x879342fb) echo "NotEligible(wallet, 708)";; 0xf667d948) echo "CouponNotDue(number, dueAt)";; *) echo "$1";; esac; }
q() { out=$("$@" 2>&1); if [ $? -eq 0 ]; then echo "   ok"; else echo "   REFUSED: $(name "$(echo "$out" | grep -oE 'custom error 0x[0-9a-f]{8}' | head -1 | cut -d' ' -f3)")"; fi; }

cd contracts
echo "0. deploy (no VERIFIER, no STABLECOIN: the script deploys the mock of each and says so)"
forge script script/DeployBond.s.sol --rpc-url $RPC --sender $ADMIN --unlocked --broadcast 2>&1 | grep -E "DEPLOYING|TokenisedBond:|ONCHAIN" | sed 's/^ */   /'
REC=$(ls deployments/*TokenisedBond*.json 2>/dev/null | head -1)
BOND=$(python3 -c "import json;print(json.load(open('$REC'))['contract'])"); MOCK=$(python3 -c "import json;print(json.load(open('$REC'))['verifier'])")
STABLE=$(cast call $BOND "stablecoin()(address)" --rpc-url $RPC)
NOW=$(cast block latest --rpc-url $RPC -f timestamp)

echo "1. the admin gives itself an issuer permission: 1,000 units, two years"; q cast send $BOND "setIssuer(address,uint64,uint64,uint256)" $ADMIN 0 $((NOW+63072000)) 1000000000000000000000 --from $ADMIN $S
echo "2. mint 10 units to an investor with no credential"; q cast send $BOND "mint(address,uint256)" $INVESTOR 10000000000000000000 --from $ADMIN $S
echo "3. the mock marks the investor Valid for request 708; the same mint again"; q cast send $MOCK "setStatus(address,uint64,uint8)" $INVESTOR 708 1 --from $ADMIN $S; q cast send $BOND "mint(address,uint256)" $INVESTOR 10000000000000000000 --from $ADMIN $S
echo "   investor holds $(cast call $BOND 'balanceOf(address)(uint256)' $INVESTOR --rpc-url $RPC | cut -d' ' -f1) (10 units)"
echo "4. the investor passes one unit to an outsider with no credential"; q cast send $BOND "transfer(address,uint256)" $OUTSIDER 1000000000000000000 --from $INVESTOR $S
echo "5. the paying agent is funded and approves; coupon 1, ninety days early"; q cast send $STABLE "mint(address,uint256)" $ADMIN 1000000000 --from $ADMIN $S; q cast send $STABLE "approve(address,uint256)" $BOND 1000000000 --from $ADMIN $S; q cast send $BOND "payCoupon()" --from $ADMIN $S
echo "6. the fork's clock moves 90 days; coupon 1 again"; cast rpc evm_increaseTime 7776000 --rpc-url $RPC >/dev/null; cast rpc evm_mine --rpc-url $RPC >/dev/null
echo "   it will cost $(cast call $BOND 'nextCouponAmount()(uint256)' --rpc-url $RPC | cut -d' ' -f1) (250.000000 of the stablecoin)"; q cast send $BOND "payCoupon()" --from $ADMIN $S
echo "   investor can claim $(cast call $BOND 'claimable(address)(uint256)' $INVESTOR --rpc-url $RPC | cut -d' ' -f1)"
echo "7. the investor claims"; q cast send $BOND "claimCoupons()" --from $INVESTOR $S
echo "   investor's stablecoin $(cast call $STABLE 'balanceOf(address)(uint256)' $INVESTOR --rpc-url $RPC | cut -d' ' -f1), left in the bond $(cast call $STABLE 'balanceOf(address)(uint256)' $BOND --rpc-url $RPC | cut -d' ' -f1)"
echo "8. coupon 2 straight away"; q cast send $BOND "payCoupon()" --from $ADMIN $S
echo "9. the investor's credential is revoked; it tries to move a unit"; q cast send $MOCK "setStatus(address,uint64,uint8)" $INVESTOR 708 3 --from $ADMIN $S; q cast send $BOND "transfer(address,uint256)" $ADMIN 1000000000000000000 --from $INVESTOR $S
