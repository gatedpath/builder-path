# Safe 1.4.1 runtime code

Runtime bytecode read with `eth_getCode` from `https://governors.testnet.redbelly.network`
on 2026-09-12 at the canonical Safe 1.4.1 addresses. The same call against mainnet returned
byte-identical code (keccak256 hashes in `src/checks/admin.ts`, checked by `test/unit.test.mjs`).

| File | Address | Bytes |
|---|---|---|
| `safe-singleton.hex` | 0x41675C099F32341bf84BFc5382aF534df5C7461a | 23,579 |
| `safe-l2-singleton.hex` | 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 | 24,421 |
| `safe-proxy-factory.hex` | 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 | 3,054 |
| `compatibility-fallback-handler.hex` | 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99 | 5,637 |

The tests etch this code onto a local Anvil at the same addresses (`anvil_setCode`) and then
deploy real Safe proxies through the factory with `createProxyWithNonce`, so the admin check
runs against genuine Safe 1.4.1 logic rather than a stub. Etching rather than compiling keeps
the test free of a Solidity toolchain and guarantees the bytes are the ones on chain.
