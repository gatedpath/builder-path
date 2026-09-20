#!/usr/bin/env bash
# Answers open question 4 properly: transaction inclusion latency as a user feels it.
# Sends N tiny self-transfers from a Foundry keystore account and times each one from
# submission to receipt. Requires: foundry (cast), a verified wallet imported with
#   cast wallet import rbn-dev --interactive
# and testnet RBNT on it.
# Usage: ./measure-latency.sh [account=rbn-dev] [count=10] [rpc=testnet governors]
set -euo pipefail
ACCOUNT="${1:-rbn-dev}"
COUNT="${2:-10}"
RPC="${3:-${RBN_TESTNET_RPC:-https://governors.testnet.redbelly.network}}"
ADDR="$(cast wallet address --account "$ACCOUNT")"
OUT="results/latency-$(date -u +%Y-%m-%dT%H%M).json"
echo "account $ACCOUNT ($ADDR)  rpc $RPC  sends $COUNT"
echo "balance before: $(cast balance "$ADDR" --rpc-url "$RPC" --ether) RBNT"
echo '{"samples":[' > "$OUT"
for i in $(seq 1 "$COUNT"); do
  t0=$(date +%s.%N)
  json=$(cast send --account "$ACCOUNT" --rpc-url "$RPC" "$ADDR" --value 1 --json)
  t1=$(date +%s.%N)
  secs=$(echo "$t1 - $t0" | bc)
  block=$(echo "$json" | sed -n 's/.*"blockNumber":"\([^"]*\)".*/\1/p')
  gas=$(echo "$json" | sed -n 's/.*"gasUsed":"\([^"]*\)".*/\1/p')
  price=$(echo "$json" | sed -n 's/.*"effectiveGasPrice":"\([^"]*\)".*/\1/p')
  echo "  #$i  ${secs}s  block $block  gasUsed $gas  effectiveGasPrice $price"
  sep=","; [ "$i" -eq "$COUNT" ] && sep=""
  echo "{\"i\":$i,\"seconds\":$secs,\"block\":\"$block\",\"gasUsed\":\"$gas\",\"effectiveGasPrice\":\"$price\"}$sep" >> "$OUT"
done
echo '],"note":"seconds = wall clock from cast send submission to receipt (cast waits for inclusion). This is what a user experiences as finality on a chain with no reorgs."}' >> "$OUT"
echo "balance after:  $(cast balance "$ADDR" --rpc-url "$RPC" --ether) RBNT"
echo "saved $OUT"
echo "median seconds: $(sed -n 's/.*"seconds":\([0-9.]*\).*/\1/p' "$OUT" | sort -n | awk '{a[NR]=$1} END{print (NR%2)?a[(NR+1)/2]:(a[NR/2]+a[NR/2+1])/2}')"
