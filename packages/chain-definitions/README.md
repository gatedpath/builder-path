# @gatedpath/chains

Chain definitions, verified contract addresses and four read-only helpers for Redbelly
Network: chain 151 (mainnet) and 153 (testnet). This is the first Phase 1 deliverable of
the Redbelly Development Tool (`PLAN.md` section 5.1). It has no runtime dependencies. viem
is an optional peer: the chain objects satisfy its `Chain` type, and `npm run check:viem`
proves it, but nothing here imports viem.

On npm as `@gatedpath/chains` since 18 September 2026: `npm install @gatedpath/chains`.

Every address and URL in `src/` traces to a dated row in `../../RESEARCH.md`. Nothing
comes from the docs environment page (`docs.redbelly.network/pages/general/rb-env/`),
which lists addresses with no code on either network.

## What it exports

`redbellyMainnet` and `redbellyTestnet` are viem-shaped chain objects: id, name,
RBNT with 18 decimals, `rpcUrls.default` pointing at the governors endpoint,
`rpcUrls.public` adding Ankr on mainnet, Routescan as the explorer with its
Etherscan-style API URL, and a `contracts` map that includes `multicall3` (with the
block it was created in) and every address below. `chains`, `chainById(id)` and
`keyedRpcs` sit beside them. `keyedRpcs.mainnet.uniblock` is the Uniblock endpoint
that needs an `x-api-key` header; it's kept out of the chain object so no client picks
it up unkeyed. Use `createRpc(url, { headers: { 'x-api-key': key } })` for it.

`addresses.mainnet` and `addresses.testnet` are typed records. Each entry is
`{ address, verifiedOn: '2026-09-12', source, note? }`, with the address in EIP-55
form. The set: bootstrap registry, permission, pricefeed, gasfees (source unverified:
the registry resolves it and it has code, but nothing documents its interface),
accredited issuer registry, the Safe 1.4.1 set (singleton, L2 singleton, proxy factory,
fallback handler, MultiSend, MultiSendCallOnly, CreateCall, SignMessageLib,
SimulateTxAccessor), the Safe singleton factory, Nick's deployer, Multicall3, Permit2
(testnet only) and the EIP-2935 history contract. `knownAllowed` holds one address per
network that `isAllowed` returned true for, used as the live test's positive control.

The helpers each take `{ rpc }`, where `rpc` is a URL string or a
`(method, params) => Promise<result>` function, so they work with any JSON-RPC
transport and never sign anything.

- `isAllowed(address, { rpc })` reads `permission.isAllowed(address)` on the contract
  the registry names. False means the wallet can't transact on that chain.
- `getLatestPrice({ rpc })` returns `{ usdPerRbnt, raw, timestamp, decimals: 6,
  returnData, priceFeed }`.
- `gasCostUsd({ gasUsed, rpc })` multiplies gas by the latest base fee and the feed
  price and returns `{ usd, rbnt, wei, gasPriceWei, ... }`. Pass `gasPriceWei` to price
  a mined transaction from its receipt.
- `resolveRegistry(name, { rpc })` calls `getContractAddress(name)` on the bootstrap
  registry and returns the address or `null` when the name isn't registered.

`agentNotes` is the string quoted at the end of this file. The lower layers are also
exported: `createRpc`, `ethCall`, the ABI encoders and decoders, `selectors`,
`keccak256`, `functionSelector` and `checksumAddress`.

```ts
import { redbellyTestnet, isAllowed, getLatestPrice, gasCostUsd } from '@gatedpath/chains';

const rpc = redbellyTestnet.rpcUrls.default.http[0];
await isAllowed('0xYourWallet', { rpc });            // false until access.redbelly.network is done
const { usdPerRbnt } = await getLatestPrice({ rpc }); // 0.002431 on 2026-09-12
const { usd } = await gasCostUsd({ gasUsed: 21_000, rpc }); // 0.0099959
```

With viem: `createPublicClient({ chain: redbellyMainnet, transport: http() })`.

## Where the numbers come from

RBNT has 18 decimals. Three things agree: the ethereum-lists entries for 151 and 153
say `decimals: 18`; a balance read on 2026-09-12 came back as
54,647,919,730,062,155,425,000 wei for a testnet account, which is 54,648 RBNT; and the
fee arithmetic only closes at 18 places: base fee 195,882,548,823,725 wei times 21,000
gas is 4.11e18 wei, and 4.11 RBNT at the feed's US$0.002432 is US$0.0100, the transfer
price Vine states.

The price feed has six decimals. That was inferred first (2427 as a raw value made the
transfer cost US$0.01) and then confirmed by calling `decimals()` on both feeds, which
answer 6. `getPriceFeedDecimals({ rpc })` re-checks it and the live test does so on
every run. The feed returns three words where Vine's ABI lists two; the third was zero.
The helper decodes the first two and exposes the full return data.

Function selectors are hardcoded in `src/abi.ts` and recomputed from the signatures by
the package's own keccak in the unit tests. `getLatestPrice()` (0x8e15f473) and
`getContractAddress(string)` (0x04433bbc) come from the ABI printed on
vine.redbelly.network/network-fees/. `isAllowed(address)` (0xbabcc539) comes from the
`IPermission` interface inside `RedbellyPermissionChecker`, a verified third-party
contract at 0xf0da85AB0D065c46290501C3c138035fA8f9EE8F on testnet; the permission,
registry and price feed contracts themselves are not verified on Routescan, so the live
test proves each selector by calling it. `decimals()` (0x313ce567) is documented
nowhere and was found by trying it.

The chain charges the base fee only: `eth_maxPriorityFeePerGas` is 0 and
`eth_gasPrice` is the base fee plus ten percent of headroom. `gasCostUsd` therefore
uses the latest block's base fee, and the live test checks that 21,000 gas comes to
US$0.01 within one percent.

## Tests

`npm test` builds and runs the offline layer with `node:test`: keccak vectors,
selectors, EIP-55 vectors from the EIP, ABI encoding and decoding, the fixed-point maths,
and the helpers against a fake RPC that replays the values measured on 2026-09-12.

`npm run test:live` hits both governors RPCs and needs an environment that can reach
them (see `../../setup/egress-allowlist.txt`). It checks the chain ID, that every
recorded address has code, that the registry resolves the three names to the recorded
addresses, that `isAllowed` is false for the zero address and true for the known
allowed address, that the price is positive with a timestamp inside the last day and six
decimals, that a transfer costs US$0.01, that Ankr serves 151, and that Uniblock
refuses a keyless call. Override endpoints with `RBN_MAINNET_RPC` and `RBN_TESTNET_RPC`.

`npm run check:viem` compiles the chain objects against viem's `Chain` type and checks
viem's checksum agrees with ours for every address.

## Last verified

2026-09-12, from a cloud session with Redbelly's hosts allowed. Nothing in
`RESEARCH.md` needed correcting.

`npm test`:

```

✔ keccak256 matches known vectors (4.272735ms)
✔ function selectors match the canonical signatures (2.684616ms)
✔ EIP-55 checksum vectors from the EIP (1.421015ms)
✔ every recorded address is checksummed and dated (8.284884ms)
✔ chain objects carry the right ids, currency, RPCs and explorers (0.260014ms)
✔ agent notes state the five facts (0.531606ms)
✔ ABI encoding of address, uint256 and string (0.430987ms)
✔ ABI decoding of bool, address and words (0.603419ms)
✔ formatUnits (0.359216ms)
✔ resolveRegistry decodes and checksums the registry answer (1.198793ms)
✔ isAllowed encodes the address and decodes the bool (0.660909ms)
✔ getLatestPrice scales by six decimals (0.367537ms)
✔ gasCostUsd reproduces the US$0.01 transfer at the measured base fee and price (1.047662ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.544356
```

`npm run test:live`:

```
✔ mainnet: eth_chainId is 151 at https://governors.mainnet.redbelly.network (508.993338ms)
bootstrapRegistry        0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 5392 bytes
permission               0xcb385cD90ca6b219798F57B4a7958897e91A9163 1159 bytes
pricefeed                0x0CD42d829F88fe539f710E9b7692C70b94aaEad4 5452 bytes
gasfees                  0x292Cc6D79E95B2848579735c24B70215179D4a33 6517 bytes
accreditedIssuerRegistry 0x2d68f1C50a057a310EeF28DF3199F95A65cE4ac5 1159 bytes
multicall3               0xcA11bde05977b3631167028862bE2a173976CA11 3808 bytes
nicksDeployer            0x4e59b44847b379578588920cA78FbF26c0B4956C 69 bytes
safeSingletonFactory     0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7 69 bytes
safeSingleton            0x41675C099F32341bf84BFc5382aF534df5C7461a 23579 bytes
safeL2Singleton          0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 24421 bytes
safeProxyFactory         0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 3054 bytes
safeFallbackHandler      0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99 5637 bytes
safeMultiSend            0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526 629 bytes
safeMultiSendCallOnly    0x9641d764fc13c8B624c04430C7356C1C7C8102e2 410 bytes
safeCreateCall           0x9b35Af71d77eaf8d7e40252370304687390A1A52 1099 bytes
safeSignMessageLib       0xd53cd0aB83D845Ac265BE939c57F53AD838012c9 966 bytes
safeSimulateTxAccessor   0x3d4BA2E0884aa488718476ca2FB8Efc291A46199 850 bytes
eip2935History           0x0000F90827F1C53a10cb7A02335B175320002935 83 bytes
✔ mainnet: eth_getCode is non-empty for every recorded address (3343.966859ms)
✔ mainnet: every chain.contracts entry is in addresses (0.272815ms)
{
  permission: '0xcb385cD90ca6b219798F57B4a7958897e91A9163',
  pricefeed: '0x0CD42d829F88fe539f710E9b7692C70b94aaEad4',
  gasfees: '0x292Cc6D79E95B2848579735c24B70215179D4a33'
}
✔ mainnet: registry resolves permission, pricefeed, gasfees to the recorded addresses (763.217506ms)
✔ mainnet: isAllowed is false for the zero address and true for the known allowed address (742.605495ms)
{
  usdPerRbnt: 0.002432,
  raw: 2432n,
  timestamp: 1789204233,
  iso: '2026-09-12T09:10:33.000Z',
  returnWords: 3
}
✔ mainnet: getLatestPrice is positive, six decimals, timestamp within a day (737.796219ms)
{
  usd: 0.009999999,
  rbnt: '4.111842105263151',
  gasPriceWei: 195802005012531n,
  usdPerRbnt: 0.002432
}
✔ mainnet: a 21,000-gas transfer costs about US$0.01 (555.767023ms)
✔ testnet: eth_chainId is 153 at https://governors.testnet.redbelly.network (555.404233ms)
bootstrapRegistry        0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 3371 bytes
permission               0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 1159 bytes
pricefeed                0xBf207257412D3672F9C772ef263583611B98039a 4803 bytes
gasfees                  0x292Cc6D79E95B2848579735c24B70215179D4a33 4307 bytes
accreditedIssuerRegistry 0x6aEe06F4052ff6d01Ed7E13Fa5Ab53675756A057 1159 bytes
permit2                  0x000000000022D473030F116dDEE9F6B43aC78BA3 9152 bytes
multicall3               0xcA11bde05977b3631167028862bE2a173976CA11 3808 bytes
nicksDeployer            0x4e59b44847b379578588920cA78FbF26c0B4956C 69 bytes
safeSingletonFactory     0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7 69 bytes
safeSingleton            0x41675C099F32341bf84BFc5382aF534df5C7461a 23579 bytes
safeL2Singleton          0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 24421 bytes
safeProxyFactory         0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 3054 bytes
safeFallbackHandler      0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99 5637 bytes
safeMultiSend            0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526 629 bytes
safeMultiSendCallOnly    0x9641d764fc13c8B624c04430C7356C1C7C8102e2 410 bytes
safeCreateCall           0x9b35Af71d77eaf8d7e40252370304687390A1A52 1099 bytes
safeSignMessageLib       0xd53cd0aB83D845Ac265BE939c57F53AD838012c9 966 bytes
safeSimulateTxAccessor   0x3d4BA2E0884aa488718476ca2FB8Efc291A46199 850 bytes
eip2935History           0x0000F90827F1C53a10cb7A02335B175320002935 83 bytes
✔ testnet: eth_getCode is non-empty for every recorded address (3650.802708ms)
✔ testnet: every chain.contracts entry is in addresses (0.375752ms)
{
  permission: '0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690',
  pricefeed: '0xBf207257412D3672F9C772ef263583611B98039a',
  gasfees: '0x292Cc6D79E95B2848579735c24B70215179D4a33'
}
✔ testnet: registry resolves permission, pricefeed, gasfees to the recorded addresses (774.917244ms)
✔ testnet: isAllowed is false for the zero address and true for the known allowed address (776.253422ms)
{
  usdPerRbnt: 0.002431,
  raw: 2431n,
  timestamp: 1789204280,
  iso: '2026-09-12T09:11:20.000Z',
  returnWords: 3
}
✔ testnet: getLatestPrice is positive, six decimals, timestamp within a day (773.561936ms)
{
  usd: 0.009995888,
  rbnt: '4.111842105263151',
  gasPriceWei: 195802005012531n,
  usdPerRbnt: 0.002431
}
✔ testnet: a 21,000-gas transfer costs about US$0.01 (575.217758ms)
✔ mainnet: the Ankr public endpoint reports chain 151 (350.744789ms)
{ uniblockKeylessStatus: 429 }
✔ mainnet: Uniblock endpoint refuses a keyless call (documented as keyed) (197.430474ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14384.596431
```

## Notes for an AI coding agent

The same text is exported as `agentNotes`.

```
Redbelly Network, facts for a coding agent (verified 2026-09-12).
Chain IDs: 151 mainnet, 153 testnet. Native coin RBNT, 18 decimals.
RPCs: https://governors.mainnet.redbelly.network and https://governors.testnet.redbelly.network. Ankr also serves mainnet at https://rpc.ankr.com/redbelly_mainnet.
Explorers: https://redbelly.routescan.io (151) and https://redbelly.testnet.routescan.io (153), Etherscan-style API under https://api.routescan.io/v2/network/{mainnet,testnet}/evm/{151,153}/etherscan/api.
Gas model in one sentence: gas is priced in US dollars (a 21,000-gas transfer costs US$0.01) and converted to RBNT at execution from an on-chain price feed, so RBNT fees move with the RBNT price and the priority fee is always zero.
Every wallet must pass isAllowed before it can transact: permission.isAllowed(address) on the contract the bootstrap registry (0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5, both chains) names as "permission" must return true, which requires identity verification at https://access.redbelly.network. Check it before deploying or sending.
Compile for prague with solc 0.8.30. Transient storage, PUSH0, MCOPY and the Prague precompiles are all present.
Blocks are produced on demand; poll aggressively. There is no block cadence: with no traffic there is no block, and a transaction lands within seconds or not at all. Do not sleep for a block time.
No debug or trace RPC methods. debug_* and trace_* are not served by the governors endpoints; net_version is not served either.
```
