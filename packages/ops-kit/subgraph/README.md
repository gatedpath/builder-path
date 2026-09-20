# Goldsky subgraph template for GatedERC20

A subgraph is the right tool once a token has enough holders that walking `Transfer` logs from
the RPC on every question gets slow, and the wrong tool before that. Routescan's API
(`../scripts/routescan-*.mjs`) answers the same questions for a small token without any
infrastructure.

## Redbelly on Goldsky needs Redbelly's approval

Goldsky lists Redbelly mainnet and testnet as supported for subgraphs, as a partner-sponsored
product, and says access is "if approved by the Redbelly team": ask Goldsky's developer relations
team for an access code to the private signup form. Edge RPC and Mirror are not available for
Redbelly. Read on 12 September 2026 at https://docs.goldsky.com/chains/redbelly (RESEARCH.md
question 11). The network slugs on that page are `redbelly` for chain 151 and `redbelly-testnet`
for chain 153; `subgraph.yaml` ships with the testnet slug.

## What is indexed

`schema.graphql` keeps a `Token` (supply, holder count, paused, verifier, request id), a `Holder`
per wallet with a balance kept from `Transfer` events, and one immutable entity per operator
event: `ForcedTransfer` with its justification hash and officer, `IssuerPermission` (mutable, one
per issuer, `active` flips on revoke), `PauseEvent`, `RoleChange` with the role name resolved,
`VerifierChange` for both the verifier and the request id, and `Denial` for every recipient a
distribution skipped. Eligibility itself is not on the log; the holder entity says so, and the
current answer is `isEligible(wallet)` on the contract.

## Use it

```
cp ../../contract-kit/abi/GatedERC20.json abis/GatedERC20.json   # already done; re-copy after a kit change
# edit subgraph.yaml: network, address, startBlock from contracts/deployments/<chainId>-GatedERC20.json
npm install
npm run codegen && npm run build
goldsky login
npm run deploy:goldsky
```

`startBlock` matters: mainnet has 3.1 million blocks (report/data/metrics.json, 12 September
2026) and indexing from zero walks all of them for a contract that did not exist.

## Not verified here

The template was written against `@graphprotocol/graph-ts` 0.38.2 and `graph-cli` 0.98.1 (npm
`latest` on 12 September 2026) and the Goldsky CLI as documented at
docs.goldsky.com/subgraphs/deploying-subgraphs. It has not been deployed: nothing of ours is on
either network yet, and Goldsky's Redbelly access needs the approval above. `graph codegen` and
`graph build` were not run in the build session either (the CLI fetches its dependencies at
install time and the build environment restricts that); the first person to run them should
expect AssemblyScript to point at anything the handlers got wrong and fix it there.
