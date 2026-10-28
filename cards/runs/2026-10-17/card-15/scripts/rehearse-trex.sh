#!/usr/bin/env bash
# Card 15 rehearsal: the whole ERC-3643 suite on the local fork, one investor registered with claims, a
# transfer refused by the token for a missing claim, the two identity layers read side by side, a claim
# revoked. Run with the fork up: `npm run dev -- --no-web --port 8555`.
#
# Save the output OUTSIDE the project tree (`bash scripts/rehearse-trex.sh > ../card-15-rehearsal-output.txt`):
# transaction hashes are 64 hex characters, the shape of a private key, and pre-flight's secret scanner
# reads every file in the tree.
#
# Every sender is an unlocked Anvil test account. Public addresses only; indices 0 and 1 are never used.
set -euo pipefail
RPC=${RPC:-http://127.0.0.1:8555}
INVESTOR=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # anvil 3
STRANGER=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65   # anvil 4
SIGNER=0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc     # anvil 5: the claim signer's key
AGENT=0x14dC79964da2C08b23698B3D3cc7Ca32193d9955      # anvil 7: the issuer's operations wallet
DEPLOYER=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f   # anvil 8
SAFE=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720       # anvil 9: stands where the Safe 1.4.1 stands

cd "$(dirname "$0")/../contracts"
step() { printf '\n== %s\n' "$*"; }
send() { cast send --rpc-url "$RPC" --unlocked "$@"; }
call() { cast call --rpc-url "$RPC" "$@"; }

step "0. the fork"
echo "chain id: $(cast chain-id --rpc-url "$RPC")  block: $(cast block-number --rpc-url "$RPC")"
REGISTRY=0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5
PERMISSION=$(call $REGISTRY "getContractAddress(string)(address)" permission)
echo "permission (network gate) from the bootstrap registry: $PERMISSION"

step "1. deploy the suite (deployer anvil 8, ADMIN_SAFE stand-in anvil 9, agent anvil 7, claim signer anvil 5)"
ADMIN_SAFE=$SAFE TOKEN_AGENT=$AGENT CLAIM_SIGNER=$SIGNER \
  forge script script/DeployTrexSuite.s.sol --rpc-url "$RPC" --sender "$DEPLOYER" --unlocked --broadcast 2>&1 \
  | grep -v "^$" | grep -iv "^##\|Setting up\|Chain 31337\|Estimated\|Sending\|Waiting\|Transactions saved\|Sensitive values\|ONCHAIN EXECUTION\|SIMULATION COMPLETE\|^Script ran\|^Logs:\|^Simulating\|^Enter\|^Total Paid\|^Paid:\|^✅\|^⠀" || true
S=deployments/31337-TrexSuite.json
j() { node -e "const s=require('./$S'); console.log(s['$1'])"; }
TOKEN=$(j token); IR=$(j identityRegistry); ISSUER=$(j claimIssuer); GATE=$(j gateReport); TIMELOCK=$(j timelock)
echo "token $TOKEN"; echo "identity registry $IR"; echo "claim issuer $ISSUER"; echo "gate report $GATE"; echo "timelock $TIMELOCK"

step "1b. gas of the whole suite's deploy, summed from the broadcast receipts"
node -e '
const r=require("./broadcast/DeployTrexSuite.s.sol/31337/run-latest.json");
let total=0n; for (const x of r.receipts) total+=BigInt(x.gasUsed);
const txs=r.transactions.map((t,i)=>`${t.transactionType.padEnd(6)} ${(t.contractName||"call").padEnd(32)} ${BigInt(r.receipts[i].gasUsed).toLocaleString("en-US").padStart(12)}`);
console.log(txs.join("\n")); console.log(`${r.receipts.length} transactions, ${total.toLocaleString("en-US")} gas in all`);
console.log(`at US$0.01 per 21,000 gas: about US$${(Number(total)/21000*0.01).toFixed(2)}`);'

step "2. the suite as deployed"
echo "token.version: $(call $TOKEN 'version()(string)')   name: $(call $TOKEN 'name()(string)')   paused: $(call $TOKEN 'paused()(bool)')"
echo "token.owner: $(call $TOKEN 'owner()(address)') (the timelock)"
echo "registry.owner: $(call $IR 'owner()(address)')"
echo "claim topics required: $(call $(j claimTopicsRegistry) 'getClaimTopics()(uint256[])')"
echo "trusted issuers: $(call $(j trustedIssuersRegistry) 'getTrustedIssuers()(address[])')"
echo "claim issuer: signer has claim key (3): $(call $ISSUER 'keyHasPurpose(bytes32,uint256)(bool)' $(cast keccak $(cast abi-encode 'f(address)' $SIGNER)) 3)"
echo "claim issuer: safe stand-in has management key (1): $(call $ISSUER 'keyHasPurpose(bytes32,uint256)(bool)' $(cast keccak $(cast abi-encode 'f(address)' $SAFE)) 1)"
echo "claim issuer: deployer has management key (1): $(call $ISSUER 'keyHasPurpose(bytes32,uint256)(bool)' $(cast keccak $(cast abi-encode 'f(address)' $DEPLOYER)) 1)"
echo "agent is token agent: $(call $TOKEN 'isAgent(address)(bool)' $AGENT)   deployer is token agent: $(call $TOKEN 'isAgent(address)(bool)' $DEPLOYER)"

step "3. the agent registers the investor (anvil 3) with an ONCHAINID, country 36"
IDENTITY_REGISTRY=$IR INVESTOR=$INVESTOR COUNTRY=36 \
  forge script script/RegisterInvestor.s.sol --rpc-url "$RPC" --sender "$AGENT" --unlocked --broadcast 2>&1 | grep -E "investor:|identity:|country:|topic:|data:|hash to sign:" || true
I=deployments/31337-investor.json
IDENTITY=$(node -e "console.log(require('./$I').identity)")
echo "registered: $(call $IR 'contains(address)(bool)' $INVESTOR)   verified before any claim: $(call $IR 'isVerified(address)(bool)' $INVESTOR)"

step "4. the claim signer (anvil 5) signs each claim with eth_sign; the investor adds them to its ONCHAINID"
for T in 1 2; do
  DATA=$(node -e "console.log(require('./$I').topic$T.data)")
  HASH=$(node -e "console.log(require('./$I').topic$T.hash)")
  SIG=$(cast rpc --rpc-url "$RPC" eth_sign "$SIGNER" "$HASH" | tr -d '"')
  echo "topic $T: signature $(echo $SIG | cut -c1-20)... ($(( (${#SIG}-2)/2 )) bytes)"
  send --from "$INVESTOR" "$IDENTITY" "addClaim(uint256,uint256,address,bytes,bytes,string)" $T 1 "$ISSUER" "$SIG" "$DATA" "" | grep -E "status|gasUsed"
  if [ "$T" = "1" ]; then SIG1=$SIG; fi
done
echo "verified after both claims: $(call $IR 'isVerified(address)(bool)' $INVESTOR)"

step "5. the agent opens the register (T-REX tokens are born paused) and mints 1,000 units to the investor"
send --from "$AGENT" "$TOKEN" "unpause()" | grep -E "status|gasUsed"
echo "paused: $(call $TOKEN 'paused()(bool)')"
send --from "$AGENT" "$TOKEN" "mint(address,uint256)" $INVESTOR 1000 | grep -E "status|gasUsed"
echo "balance: $(call $TOKEN 'balanceOf(address)(uint256)' $INVESTOR)"

step "6. the investor transfers 10 units to a wallet with no claim (anvil 4): the token refuses"
send --from "$INVESTOR" "$TOKEN" "transfer(address,uint256)(bool)" $STRANGER 10 2>&1 | tail -3 || true
echo "stranger balance: $(call $TOKEN 'balanceOf(address)(uint256)' $STRANGER)   investor balance: $(call $TOKEN 'balanceOf(address)(uint256)' $INVESTOR)"

step "7. which layer refused: the network gate (permission.isAllowed) beside the register (isVerified)"
echo "(on this fork the dev loop mocks the network gate at the real address and lets Anvil accounts 2 to 6 through;"
echo " the real gate on 153 would refuse every Anvil account. Anvil 9 is outside the mocked set.)"
for W in "investor $INVESTOR" "stranger $STRANGER" "outside-the-mock $SAFE"; do
  set -- $W
  echo "$1 $2"
  echo "  permission.isAllowed: $(call $PERMISSION 'isAllowed(address)(bool)' $2)   registry.isVerified: $(call $IR 'isVerified(address)(bool)' $2)"
  echo "  GateReport.describe: $(call $GATE 'describe(address)(string)' $2)"
done

step "8. the issuer's safe stand-in (anvil 9) revokes the investor's topic-1 claim; a mint to the investor is now refused"
send --from "$SAFE" "$ISSUER" "revokeClaimBySignature(bytes)" "$SIG1" | grep -E "status|gasUsed"
echo "claim revoked: $(call $ISSUER 'isClaimRevoked(bytes)(bool)' $SIG1)   verified: $(call $IR 'isVerified(address)(bool)' $INVESTOR)"
send --from "$AGENT" "$TOKEN" "mint(address,uint256)" $INVESTOR 1 2>&1 | tail -2 || true
echo "  GateReport.describe(investor): $(call $GATE 'describe(address)(string)' $INVESTOR)"

step "9. the timelock: the safe stand-in cannot add a claim topic directly, and the timelock's delay is $(call $TIMELOCK 'getMinDelay()(uint256)') s"
send --from "$SAFE" "$(j claimTopicsRegistry)" "addClaimTopic(uint256)" 3 2>&1 | tail -2 || true

# The investor record holds 32-byte claim hashes, 64 hex characters, the shape of a private key: pre-flight's
# secret scanner would flag it, so it does not stay in the tree once the claims are added.
rm -f "$I"

step "done. Nothing here touched a real network: chain $(cast chain-id --rpc-url "$RPC"), unlocked test accounts only."
