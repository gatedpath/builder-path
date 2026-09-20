# Safe 1.4.1 runtime bytecode

Runtime code of the canonical Safe 1.4.1 contracts, read with `cast code` from both Redbelly
networks on 2026-09-12 and found byte-identical on 151 and 153. The integration test plants
them on a plain `anvil --chain-id 151` with `anvil_setCode` at their canonical addresses and
then creates a real proxy through `SafeProxyFactory.createProxyWithNonce`, so the deploy
script's "Safe 1.4.1 with threshold >= 2" check runs against the real code rather than a
look-alike. Addresses come from `@gatedpath/chains`; nothing is retyped here.

| File | Contract | Address on 151 and 153 | keccak256 of the code |
|---|---|---|---|
| `Safe.runtime.hex` | Safe (L1 singleton) | 0x41675C099F32341bf84BFc5382aF534df5C7461a | 0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4 |
| `SafeL2.runtime.hex` | SafeL2 | 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 | 0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff |
| `SafeProxyFactory.runtime.hex` | SafeProxyFactory | 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 | 0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317 |
| `CompatibilityFallbackHandler.runtime.hex` | CompatibilityFallbackHandler | 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99 | 0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9 |

Bytecode identity with the official Safe release artefacts is recorded as unchecked in
RESEARCH.md question 14; `VERSION()` on the singleton answers "1.4.1" on both networks.
