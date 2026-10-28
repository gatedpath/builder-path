#!/bin/bash
# Rehearses a distribution on the local loop's fork of MAINNET (npm run dev -- --chain 151 --no-web --port 8558):
# a real register's real holder table, read from mainnet by scripts/holders.mjs, paid in a mock stablecoin from
# an Anvil account. Every transaction lands on Anvil (chain 31337); nothing is signed on 151.
#
#   bash scripts/rehearse-distribution.sh <holders.json> <output-dir>
#
# Save the output OUTSIDE the project tree: it carries transaction hashes, which are 64 hex characters, the
# shape of a private key, and pre-flight's secret scanner reads every file in the tree.
set -euo pipefail
HOLDERS=${1:?holders.json from scripts/holders.mjs}
OUT=${2:?an output directory outside the project}
RPC=${RPC:-http://127.0.0.1:8558}
# Anvil's default accounts 7 and 8 by address (public test addresses; the phrase they come from is not written
# here because pre-flight's secret scanner would read it). Accounts 0 and 1 are never used.
DEPLOYER=0x14dC79964da2C08b23698B3D3cc7Ca32193d9955     # account 7: the loop's deployer, allowed by the mocked gate
ADMIN=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f        # account 8: the fund administrator, the payer
TOTAL=${TOTAL:-100000000000}                                             # 100,000.000000 mAUD, six decimals
BATCH=${BATCH:-40}
mkdir -p "$OUT"
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }
receipt() { python3 -c "import json,sys; r=json.load(sys.stdin); print('   status', r['status'], 'gasUsed', int(r['gasUsed'],16), 'block', int(r['blockNumber'],16), 'tx', r['transactionHash'])"; }

REGISTER=$(python3 -c "import json; print(json.load(open('$HOLDERS'))['register'])")
SNAPSHOT=$(python3 -c "import json; print(json.load(open('$HOLDERS'))['snapshotBlock'])")
COUNT=$(python3 -c "import json; print(json.load(open('$HOLDERS'))['holderCount'])")
TOTAL_BAL=$(python3 -c "import json; print(json.load(open('$HOLDERS'))['totalBalance'])")
ADDRS=$(python3 -c "import json; print('[' + ','.join(h['address'] for h in json.load(open('$HOLDERS'))['holders']) + ']')")
BALS=$(python3 -c "import json; print('[' + ','.join(h['balance'] for h in json.load(open('$HOLDERS'))['holders']) + ']')")

echo "# Distribution rehearsal on a LOCAL fork of Redbelly mainnet. $(date)"
echo "rpc $RPC   chain id $(cast chain-id --rpc-url $RPC)   block $(cast block-number --rpc-url $RPC)"
echo "register $REGISTER (a real ERC-3643 register on mainnet; read only)"
echo "holder table: $COUNT holders with a balance at snapshot block $SNAPSHOT, total balance $TOTAL_BAL (from $HOLDERS)"
echo "deployer: Anvil account 7 $DEPLOYER   administrator and payer: Anvil account 8 $ADMIN"
START_BLOCK=$(cast block-number --rpc-url $RPC)

say "1. the register is a register: identityRegistry() answers with a contract, and it is paused=$(cast call $REGISTER 'paused()(bool)' --rpc-url $RPC)"
IDR=$(cast call $REGISTER 'identityRegistry()(address)' --rpc-url $RPC); echo "   identityRegistry $IDR, code $(cast code $IDR --rpc-url $RPC | wc -c | tr -d ' ') hex chars; name $(cast call $REGISTER 'name()(string)' --rpc-url $RPC), totalSupply $(cast call $REGISTER 'totalSupply()(uint256)' --rpc-url $RPC)"

say "2. deploy RegisterDistributor through its script (the scaffold's pre-flight runs first)"
(cd contracts && forge script script/DeployDistributor.s.sol --rpc-url $RPC --sender $DEPLOYER --unlocked --broadcast 2>&1 | grep -E "RegisterDistributor:|pre-flight|Preflight|ONCHAIN|Success|Error|revert" | sed 's/^/   /')
DIST=$(python3 -c "
import json,glob
runs=sorted(glob.glob('contracts/broadcast/DeployDistributor.s.sol/31337/run-latest.json'))
print([t for t in json.load(open(runs[-1]))['transactions'] if t['contractName']=='RegisterDistributor'][0]['contractAddress'])")
echo "   RegisterDistributor $DIST"

say "3. deploy the mock stablecoin from account 7 and fund the administrator"
COIN=$(cd contracts && forge create test/mocks/MockStable.sol:MockStable --rpc-url $RPC --unlocked --from $DEPLOYER --broadcast --json | python3 -c "import json,sys; print(json.load(sys.stdin)['deployedTo'])")
echo "   MockStable (mAUD, 6 decimals) $COIN"
cast send $COIN 'mint(address,uint256)' $ADMIN $TOTAL --rpc-url $RPC --unlocked --from $DEPLOYER --json | receipt
cast send $COIN 'approve(address,uint256)' $DIST $TOTAL --rpc-url $RPC --unlocked --from $ADMIN --json | receipt
echo "   administrator mAUD balance: $(cast call $COIN 'balanceOf(address)(uint256)' $ADMIN --rpc-url $RPC)"

say "4. the administrator opens the distribution: $TOTAL units of mAUD across $COUNT holders of $REGISTER at block $SNAPSHOT"
cast send $DIST 'open(address,address,uint256,uint256,address[],uint256[])' $COIN $REGISTER $SNAPSHOT $TOTAL "$ADDRS" "$BALS" --rpc-url $RPC --unlocked --from $ADMIN --json | receipt
echo "   distribution 1: $(cast call $DIST 'distribution(uint256)((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))' 1 --rpc-url $RPC)"
echo "   administrator mAUD balance after open (nothing moved): $(cast call $COIN 'balanceOf(address)(uint256)' $ADMIN --rpc-url $RPC)"

SECOND=$(python3 -c "import json; print(json.load(open('$HOLDERS'))['holders'][1]['address'])")
say "5. one holder is put on the mock coin's deny list before paying, to rehearse a payment that fails part way: $SECOND"
cast send $COIN 'setDenied(address,bool)' $SECOND true --rpc-url $RPC --unlocked --from $DEPLOYER --json | receipt

say "6. pay in batches of $BATCH"
PAID_TX=0
while true; do
  CURSOR=$(cast call $DIST 'distribution(uint256)((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))' 1 --rpc-url $RPC | python3 -c "import sys,re; t=sys.stdin.read(); f=[x.strip() for x in t.strip('()\n').split(',')]; print(f[7].split()[0])")
  if [ "$CURSOR" -ge "$COUNT" ]; then break; fi
  echo "   pay(1, $BATCH) from cursor $CURSOR:"
  cast send $DIST 'pay(uint256,uint256)' 1 $BATCH --rpc-url $RPC --unlocked --from $ADMIN --json | receipt
  PAID_TX=$((PAID_TX+1))
done
echo "   $PAID_TX pay transactions"
echo "   distribution 1 after paying: $(cast call $DIST 'distribution(uint256)((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))' 1 --rpc-url $RPC)"
echo "   (fields: payer, stablecoin, register, snapshotBlock, total, totalBalance, holderCount, cursor, due, paid, paidCount, failedCount, closed)"

say "7. the failed holder: status (0 Pending, 1 Paid, 2 Skipped, 3 Failed) = $(cast call $DIST 'statusOf(uint256,address)(uint8)' 1 $SECOND --rpc-url $RPC); taken off the deny list and retried"
cast send $COIN 'setDenied(address,bool)' $SECOND false --rpc-url $RPC --unlocked --from $DEPLOYER --json | receipt
cast send $DIST 'retry(uint256,address)' 1 $SECOND --rpc-url $RPC --unlocked --from $ADMIN --json | receipt
echo "   status now $(cast call $DIST 'statusOf(uint256,address)(uint8)' 1 $SECOND --rpc-url $RPC), mAUD balance $(cast call $COIN 'balanceOf(address)(uint256)' $SECOND --rpc-url $RPC)"
cast send $DIST 'close(uint256)' 1 --rpc-url $RPC --unlocked --from $ADMIN --json | receipt

say "8. check every holder's mAUD against total * balance / totalBalance, and sum them"
python3 - "$HOLDERS" "$COIN" "$RPC" "$TOTAL" <<'EOF'
import json,subprocess,sys
h=json.load(open(sys.argv[1])); coin=sys.argv[2]; rpc=sys.argv[3]; total=int(sys.argv[4]); tb=int(h['totalBalance'])
got=0; bad=0
for x in h['holders']:
    bal=int(subprocess.check_output(['cast','call',coin,'balanceOf(address)(uint256)',x['address'],'--rpc-url',rpc]).decode().split()[0])
    want=total*int(x['balance'])//tb
    got+=bal
    if bal!=want: bad+=1; print('   MISMATCH', x['address'], bal, want)
print(f'   {len(h["holders"])} holders checked, {bad} mismatches; sum received {got}; dust {total-got} units stayed in the wallet')
EOF
echo "   administrator mAUD balance now: $(cast call $COIN 'balanceOf(address)(uint256)' $ADMIN --rpc-url $RPC) (the dust)"

say "9. the register was never touched: its Transfer log since block $START_BLOCK and the largest holder's balance"
echo "   register events since the rehearsal began: $(cast logs --from-block $START_BLOCK --to-block latest --address $REGISTER --rpc-url $RPC | grep -c 'address:' || true)"
BIG=$(python3 -c "import json; h=json.load(open('$HOLDERS'))['holders']; print(max(h,key=lambda x:int(x['balance']))['address'])")
echo "   $BIG register balance now $(cast call $REGISTER 'balanceOf(address)(uint256)' $BIG --rpc-url $RPC) (snapshot: $(python3 -c "import json; h=json.load(open('$HOLDERS'))['holders']; print([x['balance'] for x in h if x['address']=='$BIG'][0])"))"
echo "   is the distributor verified on the register's identity registry? $(cast call $IDR 'isVerified(address)(bool)' $DIST --rpc-url $RPC)"

say "10. export the receipt"
node scripts/receipt.mjs --rpc $RPC --distributor $DIST --id 1 --from $START_BLOCK --out "$OUT/receipt.csv"
echo "   rows: $(($(wc -l < "$OUT/receipt.csv") - 1)); by status: $(tail -n +2 "$OUT/receipt.csv" | cut -d, -f2 | sort | uniq -c | tr '\n' ';')"
python3 - "$OUT/receipt.json" <<'EOF'
import json,sys
s=json.load(open(sys.argv[1]))
print('   opened:', s.get('opened')); print('   completed:', s.get('completed')); print('   closed:', bool(s.get('closed')))
EOF
echo
echo "done. $(date)"
