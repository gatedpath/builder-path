#!/usr/bin/env bash
# Rehearses the gated pool on the local fork that `npm run dev -- --no-web --port 8550 --request-id 708`
# left running. Every sender is an unlocked Anvil account (never 0 or 1); nothing here signs on a real
# network. Save the output OUTSIDE the project tree: transaction hashes are 64 hex characters, the shape
# of a private key, and pre-flight's secret scanner reads every file in the tree.
#   bash scripts/rehearse-pool.sh > ../card-10-rehearsal-output.txt
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=${RPC:-http://127.0.0.1:8550}
REC=deployments/local.json
j() { node -e "const d=require('./$REC'); console.log($1)"; }
FACTORY=$(j d.contract); VERIFIER=$(j d.verifier); REQ=$(j d.requestId)
DEPLOYER=$(j d.deployer.address)
NEVER=$(j 'd.wallets[0].address'); VALID=$(j 'd.wallets[1].address'); EXPIRED=$(j 'd.wallets[2].address')
REVOKED=$(j 'd.wallets[3].address'); WRONG=$(j 'd.wallets[4].address')
# Anvil account 8: never allowed by the permission mock, so an unverified wallet on this chain
UNVERIFIED=$(cast rpc eth_accounts --rpc-url "$RPC" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s)[8]))")
PAIR=$(cast call "$FACTORY" "allPairs(uint256)(address)" 0 --rpc-url "$RPC")
T0=$(cast call "$PAIR" "token0()(address)" --rpc-url "$RPC"); T1=$(cast call "$PAIR" "token1()(address)" --rpc-url "$RPC")
START=$(cast block-number --rpc-url "$RPC")
ONE=1000000000000000000

say() { printf '\n== %s\n' "$*"; }
send() { # send FROM TO SIG ARGS... ; prints tx hash, gas used, status
  local from=$1 to=$2 sig=$3; shift 3
  # A fixed gas limit, not an estimate: eth_estimateGas runs at the last block's timestamp, where the pair's
  # price accumulators are not written (timeElapsed is zero), and the real block a second later writes them.
  # On a chain with on-demand blocks the estimate is then about 44,000 gas short and the swap runs out of gas.
  local out; out=$(cast send "$to" "$sig" "$@" --from "$from" --unlocked --gas-limit 400000 --rpc-url "$RPC" --json)
  node -e "const r=JSON.parse(process.argv[1]); console.log('   tx', r.transactionHash, 'gas', parseInt(r.gasUsed,16), 'status', r.status==='0x1'?'ok':'REVERTED')" "$out"
}
refuse() { # refuse FROM TO SIG ARGS... ; a simulated call that must revert; decodes the custom error
  local from=$1 to=$2 sig=$3; shift 3
  local out; if out=$(cast call "$to" "$sig" "$@" --from "$from" --rpc-url "$RPC" 2>&1); then echo "   UNEXPECTED SUCCESS: $out"; return 1; fi
  local data; data=$(printf '%s' "$out" | grep -o 'data: "0x[0-9a-fA-F]*"' | head -1 | grep -o '0x[0-9a-fA-F]*' || true)
  if [ -z "$data" ]; then echo "   refused: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"; return 0; fi
  local sel=${data:0:10}
  case $sel in
    0x$(cast sig "NotEligible(address,uint64)" | cut -c3-)) echo "   refused NotEligible(wallet, requestId) = $(cast abi-decode "x()(address,uint64)" "0x${data:10}" | tr '\n' ' ')";;
    0x$(cast sig "NotVerified(address)" | cut -c3-))        echo "   refused NotVerified(wallet) = $(cast abi-decode "x()(address)" "0x${data:10}")";;
    0x08c379a0) echo "   refused Error(string) = $(cast abi-decode "x()(string)" "0x${data:10}")";;
    *) echo "   refused, selector $sel, data $data";;
  esac
}
bal() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url "$RPC" | cut -d' ' -f1; }
status() { cast call "$VERIFIER" "eligibilityStatus(address,uint64)(uint8)" "$1" "$REQ" --rpc-url "$RPC"; }
reserves() { cast call "$PAIR" "getReserves()(uint112,uint112,uint32)" --rpc-url "$RPC" | cut -d' ' -f1 | tr '\n' ' '; }
amount_out() { node -e "const [a,ri,ro]=process.argv.slice(1).map(BigInt); const f=a*997n; console.log((f*ro/(ri*1000n+f)).toString())" "$1" "$2" "$3"; }
lp() { bal "$PAIR" "$1"; }
# token amounts exceed 64 bits, so no shell arithmetic on them
sub() { node -e "console.log((BigInt(process.argv[1]) - BigInt(process.argv[2])).toString())" "$1" "$2"; }
inc() { node -e "console.log((BigInt(process.argv[1]) + 1n).toString())" "$1"; }

echo "Gated liquidity pool rehearsal, $(date -u +%Y-%m-%dT%H:%M:%SZ), chain $(cast chain-id --rpc-url "$RPC"), fork block at start $START"
echo "factory $FACTORY  verifier $VERIFIER  request id $REQ  pair $PAIR"
echo "token0 $T0  token1 $T1"
echo "wallets: Valid(3) $VALID  NeverIssued(2) $NEVER  Expired(4) $EXPIRED  Revoked(5) $REVOKED  WrongJurisdiction(6) $WRONG  unverified(8) $UNVERIFIED  deployer(7) $DEPLOYER"
echo "factory.requestId() = $(cast call "$FACTORY" "requestId()(uint64)" --rpc-url "$RPC"); isVerifiedRecipient(Valid) = $(cast call "$FACTORY" "isVerifiedRecipient(address)(bool)" "$VALID" --rpc-url "$RPC"); isVerifiedRecipient(unverified) = $(cast call "$FACTORY" "isVerifiedRecipient(address)(bool)" "$UNVERIFIED" --rpc-url "$RPC")"

say "1. Mint 1,000,000 of each pool token to every wallet (the mock tokens are open to anyone)"
for w in $NEVER $VALID $EXPIRED $REVOKED $WRONG $UNVERIFIED; do
  send "$DEPLOYER" "$T0" "mint(address,uint256)" "$w" $((1000000))000000000000000000
  send "$DEPLOYER" "$T1" "mint(address,uint256)" "$w" $((1000000))000000000000000000
done

say "2. The Valid wallet adds liquidity: 100,000 of each token into the pair, then mint(self)"
send "$VALID" "$T0" "transfer(address,uint256)" "$PAIR" 100000000000000000000000
send "$VALID" "$T1" "transfer(address,uint256)" "$PAIR" 100000000000000000000000
send "$VALID" "$PAIR" "mint(address)" "$VALID"
echo "   LP balance of Valid: $(lp "$VALID")   reserves: $(reserves)"

say "3. Pool entry refused in the four non-valid states (each sends 1,000 of each token in, is refused on mint, and the Valid wallet skims the deposit back to it)"
for pair_ in "NeverIssued:$NEVER" "Expired:$EXPIRED" "Revoked:$REVOKED" "WrongJurisdiction:$WRONG"; do
  name=${pair_%%:*}; w=${pair_#*:}
  echo " - $name $w (eligibilityStatus = $(status "$w"))"
  send "$w" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000000
  send "$w" "$T1" "transfer(address,uint256)" "$PAIR" 1000000000000000000000
  refuse "$w" "$PAIR" "mint(address)" "$w"
  send "$VALID" "$PAIR" "skim(address)" "$w"
  echo "   LP balance of $name: $(lp "$w"); token0 balance back to $(bal "$T0" "$w")"
done

say "4. A swap by a verified wallet with no credential (NeverIssued): 1,000 token0 in, token1 out"
read -r R0 R1 _ <<<"$(reserves)"
OUT=$(amount_out 1000000000000000000000 "${R0%% *}" "${R1%% *}")
B_BEFORE=$(bal "$T1" "$NEVER")
send "$NEVER" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000000
send "$NEVER" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$NEVER" 0x
echo "   token1 received: $(sub "$(bal "$T1" "$NEVER")" "$B_BEFORE") (quoted $OUT)   reserves: $(reserves)"

say "5. The same swap with one more unit of output than the constant product allows"
read -r R0 R1 _ <<<"$(reserves)"
OUT=$(amount_out 1000000000000000000000 "${R0%% *}" "${R1%% *}")
send "$NEVER" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000000
refuse "$NEVER" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$(inc "$OUT")" "$NEVER" 0x
echo "   and at the quoted amount it goes through:"
send "$NEVER" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$NEVER" 0x

say "6. Swap output to a wallet the network never verified (Anvil account 8) is refused, from a verified sender and from the unverified wallet itself"
read -r R0 R1 _ <<<"$(reserves)"
OUT=$(amount_out 1000000000000000000000 "${R0%% *}" "${R1%% *}")
send "$UNVERIFIED" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000000
refuse "$NEVER" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$UNVERIFIED" 0x
refuse "$UNVERIFIED" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$UNVERIFIED" 0x
echo "   (on 151 and 153 the chain refuses the unverified sender before the pair sees it; the fork does not enforce that, the pair does)"
echo "   the unverified wallet's deposit is stranded until someone skims it to a verified wallet:"
send "$VALID" "$PAIR" "skim(address)" "$NEVER"

say "7. Revoked and WrongJurisdiction wallets swap too: the credential gates liquidity, not trading"
for w in $REVOKED $WRONG; do
  read -r R0 R1 _ <<<"$(reserves)"
  OUT=$(amount_out 100000000000000000000 "${R0%% *}" "${R1%% *}")
  send "$w" "$T0" "transfer(address,uint256)" "$PAIR" 100000000000000000000
  send "$w" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$w" 0x
done

say "8. A credential that expires after the position was opened: account 4 made Valid until now + 600 s, adds liquidity, time passes"
NOW=$(cast block --rpc-url "$RPC" -f timestamp)
send "$DEPLOYER" "$VERIFIER" "setValidUntil(address,uint64,uint64)" "$EXPIRED" "$REQ" $((NOW + 600))
echo "   eligibilityStatus(account 4) = $(status "$EXPIRED") (1 = Valid)"
send "$EXPIRED" "$T0" "transfer(address,uint256)" "$PAIR" 50000000000000000000000
send "$EXPIRED" "$T1" "transfer(address,uint256)" "$PAIR" 50000000000000000000000
send "$EXPIRED" "$PAIR" "mint(address)" "$EXPIRED"
LP4=$(lp "$EXPIRED"); echo "   LP balance of account 4: $LP4"
cast rpc evm_increaseTime 601 --rpc-url "$RPC" > /dev/null; cast rpc evm_mine --rpc-url "$RPC" > /dev/null
echo "   601 s later: eligibilityStatus(account 4) = $(status "$EXPIRED") (2 = Expired)"
echo "   adding more is refused:"
send "$EXPIRED" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000
send "$EXPIRED" "$T1" "transfer(address,uint256)" "$PAIR" 1000000000000000000
refuse "$EXPIRED" "$PAIR" "mint(address)" "$EXPIRED"
send "$VALID" "$PAIR" "skim(address)" "$EXPIRED"
echo "   leaving is not: LP tokens into the pair, then burn(self)"
A_BEFORE=$(bal "$T0" "$EXPIRED"); B_BEFORE=$(bal "$T1" "$EXPIRED")
send "$EXPIRED" "$PAIR" "transfer(address,uint256)" "$PAIR" "$LP4"
send "$EXPIRED" "$PAIR" "burn(address)" "$EXPIRED"
echo "   token0 back: $(sub "$(bal "$T0" "$EXPIRED")" "$A_BEFORE")  token1 back: $(sub "$(bal "$T1" "$EXPIRED")" "$B_BEFORE")  LP left: $(lp "$EXPIRED")   reserves: $(reserves)"

say "9. The Valid wallet's credential is revoked after the fact: it cannot add, cannot hand its position to another non-wholesale wallet, can still swap and can still leave"
send "$DEPLOYER" "$VERIFIER" "setStatus(address,uint64,uint8)" "$VALID" "$REQ" 3
echo "   eligibilityStatus(account 3) = $(status "$VALID") (3 = Revoked)"
send "$VALID" "$T0" "transfer(address,uint256)" "$PAIR" 1000000000000000000
send "$VALID" "$T1" "transfer(address,uint256)" "$PAIR" 1000000000000000000
refuse "$VALID" "$PAIR" "mint(address)" "$VALID"
refuse "$VALID" "$PAIR" "transfer(address,uint256)" "$NEVER" 1
read -r R0 R1 _ <<<"$(reserves)"
OUT=$(amount_out 1000000000000000000 "${R0%% *}" "${R1%% *}")
send "$VALID" "$PAIR" "swap(uint256,uint256,address,bytes)" 0 "$OUT" "$VALID" 0x
echo "   (the 1 token0 sent in for the refused mint paid for that swap; the 1 token1 stays in the pool)"
LP3=$(lp "$VALID")
send "$VALID" "$PAIR" "transfer(address,uint256)" "$PAIR" "$LP3"
send "$VALID" "$PAIR" "burn(address)" "$VALID"
echo "   LP left: $(lp "$VALID")   reserves after everyone left: $(reserves)   totalSupply (the locked MINIMUM_LIQUIDITY): $(cast call "$PAIR" "totalSupply()(uint256)" --rpc-url "$RPC")"

say "10. The gates on the log: EligibilityDenied is never emitted (every refusal reverts); PairCreated, Mint, Burn and Swap counts since block $START"
for ev in "PairCreated(address,address,address,uint256)" "Mint(address,uint256,uint256)" "Burn(address,uint256,uint256,address)" "Swap(address,uint256,uint256,uint256,uint256,address)"; do
  n=$(cast logs --from-block "$START" --to-block latest "$ev" --rpc-url "$RPC" | grep -c "blockNumber" || true)
  echo "   ${ev%%(*}: $n"
done
echo
echo "end of rehearsal, block $(cast block-number --rpc-url "$RPC"), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
