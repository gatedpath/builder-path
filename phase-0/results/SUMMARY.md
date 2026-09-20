# Phase 0 results, 12 September 2026

First session in which Redbelly's hosts were reachable. Everything here is read-only:
no wallet, no faucet, no transaction. Raw data sits beside this file; the reasoning and
sources are in `../../RESEARCH.md`.

## Connectivity

All twelve hosts answered (`CONNECTIVITY.md`). Both governors RPCs speak JSON-RPC and
report the expected chain IDs. Routescan's front page refuses curl with a 403, but its API
at api.routescan.io works keyless. GitHub's web and API refuse the session's proxy, but
anonymous git clones go through, which is how the two public Receptor repos were read.

## Answered

Seven questions moved to verified, ten to partial. The ones that change code:

The EVM is Prague on both networks, and Vine says so in as many words, with Solidity
0.8.30 as the stated compiler. The probe agrees: PUSH0, transient storage, MCOPY, the blob
opcodes, precompiles 0x01 to 0x0a, the BLS12-381 precompiles at 0x0b and 0x10, the
EIP-2935 history contract with code at its fixed address, and `requestsHash` in block
headers. The plan's "compile for paris until confirmed" is retired.

Scaffolder pin: `solc = "0.8.30"`, `evm_version = "prague"`. If a dependency cannot
build for Prague yet, `cancun` loses nothing that matters for contracts. Do not go
below `cancun`; transient storage is worth having for reentrancy locks.

Gas is what Vine says: US$0.01 per 21,000-gas transfer, unit price
US$0.000000476190476190. The mechanism is visible on-chain. A bootstrap registry at
`0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5` (same address on 151 and 153) resolves
`pricefeed`, `gasfees` and `permission`. The price feed returned 2427 for mainnet, which is
US$0.002427 per RBNT with six decimals, and the block base fee times 21,000 came to
US$0.01 at that price. `eth_gasPrice` is the base fee plus ten percent; the priority fee
is zero. The gas helper can compute RBNT cost from the feed with no external price source.

Deployer eligibility has a read path. `permission.isAllowed(address)` (testnet
`0x519ba1b48d571fd92faf6fe4d20fe74ca435b690`, mainnet
`0xcb385cd90ca6b219798f57b4a7958897e91a9163`) returned true for known deployers and false
for the zero address. That is the pre-flight check for "is this wallet verified on the
target chain". The interface came from a verified `RedbellyPermissionChecker` on testnet.

Safe 1.4.1 is deployed at the canonical addresses on both networks, Safe 1.3.0 on mainnet
only, Multicall3 and the two deterministic deployers on both. The admin pattern in the
plan needs no custom deployment.

Business verification exists and is documented. A director with a personal identity
registers the company through an accredited issuer (Averer), a `BusinessIdentifier`
contract is deployed, and delegate wallets added to it get network write access as
sub-accounts without their own KYC. That answers question 25, and it is the clean place for
development and deploy wallets: under the business, as delegates, and not under a person.

The verifier picture changed. `receptor-standardvc-sc` is an npm package on GitHub
Packages, not a public repo; the archived example that inherits it pins solc 0.8.22 and
shanghai. The documented path now is the Eligibility Kit (React SDK, also on GitHub
Packages, needs a token and a verifier API key from Redbelly support) using Iden3
queries; on-chain verification is a `ZKPVerifier`-derived contract and only single
queries are supported on-chain today. There is no network-wide verifier address to pin.
The `ReceptorMock` in the plan should mock a `ZKPVerifier` request/response, and the
five credential states map onto Iden3 revocation and issuer allow-lists.

Schemas: twelve in the repo, seven queryable through the SDK, including
`AUSophisticatedWholesaleInvestorCredential` and `ProofOfAddressCredential`, so the
recipe list in PLAN.md section 12 is buildable.

## Block interval

| Network | Blocks in 10 min | Median gap | Min | Max | Empty blocks |
|---|---|---|---|---|---|
| Testnet 153 | 6 | 90 s | 27 s | 231 s | 0 |
| Mainnet 151 | 8 | 90 s | 2 s | 192 s | 0 |

Blocks appear when there are transactions and not otherwise. Mainnet went four minutes
without a block, then produced three in six seconds. So the 37-second figure on Chainspect
and the 3-second figure in the paper are both averages over traffic, not properties of
the chain. The number a builder needs is inclusion latency under load, which needs a
funded wallet (`measure-latency.sh`). Do not schedule the 24-hour run; a busy hour is
more informative. Frontend polling can be aggressive: a transaction either lands in the
next block within seconds or it is not coming.

## Surprises

The docs environment page (`docs.redbelly.network/pages/general/rb-env/`) lists Iden3
State, Poseidon and MTP contract addresses that have no code on either network, and
labels mainnet as chain 154. Treat that page as stale and do not put its addresses in
the chain definitions package.

Vine's tooling advice is Hardhat, Waffle and Remix. Nothing mentions Foundry. Our
Foundry-first scaffold is a real delta from the official material, which is fine, but
the golden path should show the Hardhat config too.

The faucet is FAUCETME at `redbelly.faucetme.pro` with Discord login, not a Discord slash
command. Amount and cooldown are unknown until a wallet uses it.

Routescan indexes testnet as chain `153_2`, which implies at least one reset. Worth asking
whether a reset keeps access credentials.

The RPC does not serve `debug_*` or `trace_*` methods, or `net_version`. Indexers that
need traces cannot use the governors endpoint; Goldsky subgraphs (partner-sponsored,
approval needed) are the documented indexing route.

`web3_clientVersion` returns `./linux-amd64/go1.25.14`, a Go client that does not
identify itself as geth.

## Still open

Questions 5 (ordering inside a super block), 10 (node licence, read-only node), 16 (MCP
objection), 19, 21, 22 (wallet slots, hardware flow, terms), 23 and 24 (revocation) need
Redbelly or a wallet. Question 8's upgrade policy is now "how does Redbelly change the
permission and registry contracts", since there is no shared verifier to upgrade.

## Script changes this session

`probe-opcodes.mjs`: the modexp expected value was wrong (2^3 mod 5 is 3, not 8);
ecrecover on an all-zero signature returns empty on Ethereum too, so empty is now the
expected result; a "mismatched versioned hash" error from the KZG precompile is
reported as present; added the two BLS precompiles and the EIP-2935 contract so the
script can infer Prague. `chain-check.mjs`: reports whether the header has
`requestsHash`. Nothing else needed changing against the real RPC.
