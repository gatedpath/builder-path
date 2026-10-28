#!/bin/bash
# Stablecoin sender probe on a LOCAL Anvil fork of Redbelly mainnet. Nothing signed on 151.
set -u
RPC=http://127.0.0.1:8558
MN="test test test test test test test test test test test junk"
A2=$(cast wallet address --mnemonic "$MN" --mnemonic-index 2); A3=$(cast wallet address --mnemonic "$MN" --mnemonic-index 3)
echo "# Stablecoin sender probe on a LOCAL Anvil fork of Redbelly mainnet (chain 31337 on 127.0.0.1:8558). Nothing signed on 151."
echo "fork block: $(cast block-number --rpc-url $RPC)   fork chain id: $(cast chain-id --rpc-url $RPC)   $(date)"
echo "anvil account 2 (deploys the probe contract): $A2"; echo "anvil account 3 (recipient): $A3"
BIN=$(sed 's/^0x//' fwd/fwd.bin)
FWD=$(cast send --rpc-url $RPC --unlocked --from $A2 --create 0x$BIN --json | python3 -c "import json,sys; print(json.load(sys.stdin)['contractAddress'])")
echo "Forwarder (a plain contract that calls token.transfer / transferFrom): $FWD"
st() { python3 -c "import json,sys; d=sys.stdin.read()
try:
    r=json.loads(d); print('   status', r['status'], 'gasUsed', int(r['gasUsed'],16))
except Exception: print('   REVERTED/ERROR:', d.strip().replace(chr(10),' ')[:400])"; }
for T in AUDD:0x54a210e824B0F89dA988E4B5586440aB354f0e46:0xd0eb9c0a33588eeacf4350375e62ad068380ee60:1000000 AUDM:0x081599E4936D12c46Bd48913B2329115Cd26cbdd:0xd0eb9c0a33588eeacf4350375e62ad068380ee60:1000000000000000000 rAUD:0xf950b1beA7AB1688e1EAA96c0Ff0ccBAB087BB54:0xc9129Bea5F66A7E14A9016414f97fC728FA85D29:1000000; do
  IFS=: read -r N TOK HOLDER AMT <<< "$T"
  echo; echo "== $N $TOK, real holder impersonated locally: $HOLDER"
  cast rpc anvil_impersonateAccount $HOLDER --rpc-url $RPC >/dev/null; cast rpc anvil_setBalance $HOLDER 0x33B2E3C9FD0803CE8000000 --rpc-url $RPC >/dev/null; cast rpc anvil_setBalance $A3 0x33B2E3C9FD0803CE8000000 --rpc-url $RPC >/dev/null
  echo "holder balance before: $(cast call $TOK 'balanceOf(address)(uint256)' $HOLDER --rpc-url $RPC)"
  echo "-- 1. holder -> Forwarder contract (a contract as RECIPIENT):"
  cast send $TOK 'transfer(address,uint256)' $FWD $AMT --rpc-url $RPC --unlocked --from $HOLDER --gas-limit 300000 --json 2>&1 | st
  echo "   forwarder balance: $(cast call $TOK 'balanceOf(address)(uint256)' $FWD --rpc-url $RPC)"
  echo "-- 2. Forwarder contract -> anvil account 3 (a contract as SENDER, token.transfer):"
  cast send $FWD 'send(address,address,uint256)' $TOK $A3 $AMT --rpc-url $RPC --unlocked --from $A2 --gas-limit 300000 --json 2>&1 | st
  echo "   account 3 balance: $(cast call $TOK 'balanceOf(address)(uint256)' $A3 --rpc-url $RPC)"
  echo "-- 3. holder approves Forwarder; Forwarder pulls to account 3 (a contract as SPENDER, token.transferFrom):"
  cast send $TOK 'approve(address,uint256)' $FWD $AMT --rpc-url $RPC --unlocked --from $HOLDER --gas-limit 300000 --json 2>&1 | st
  cast send $FWD 'pull(address,address,address,uint256)' $TOK $HOLDER $A3 $AMT --rpc-url $RPC --unlocked --from $A2 --gas-limit 300000 --json 2>&1 | st
  echo "   account 3 balance: $(cast call $TOK 'balanceOf(address)(uint256)' $A3 --rpc-url $RPC)"
  echo "-- 4. account 3 (a fresh Anvil EOA, on no list) -> account 2 (an unlisted EOA as sender and recipient):"
  cast send $TOK 'transfer(address,uint256)' $A2 1 --rpc-url $RPC --unlocked --from $A3 --gas-limit 300000 --json 2>&1 | st
  echo "   account 2 balance: $(cast call $TOK 'balanceOf(address)(uint256)' $A2 --rpc-url $RPC)"
done
