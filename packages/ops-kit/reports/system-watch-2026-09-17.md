# System-contract watcher, first live run, 17 September 2026

Read-only, from the owner's Mac, against the governors RPC of each network. Nothing signed, no wallet,
no webhook (`--dry-run`). State files were kept outside the repository.

## Baseline, then silence

`node scripts/system-watch.mjs --network <n> --once --dry-run`, twice per network. First pass: "baseline
taken at block N; only changes after it will alert", exit 0. Second pass: no output, exit 0.

| | mainnet (151) | testnet (153) |
|---|---|---|
| Baseline block | 3187697 | 3037004 |
| `registry` address | `0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5` | `0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5` |
| `registry` code fingerprint | `0x3e8b08a364662e85…` | `0x282191be868770c5…` |
| `permission` address | `0xcb385cd90ca6b219798f57b4a7958897e91a9163` | `0x519ba1b48d571fd92faf6fe4d20fe74ca435b690` |
| `permission` code fingerprint | `0xa8177016793fbc40…` | `0xbe00d52eef327f43…` |
| `pricefeed` address | `0x0cd42d829f88fe539f710e9b7692c70b94aaead4` | `0xbf207257412d3672f9c772ef263583611b98039a` |
| `pricefeed` code fingerprint | `0x7ed98a3ab096222a…` | `0x553bf9c9edb422e4…` |
| `gasfees` address | `0x292cc6d79e95b2848579735c24b70215179d4a33` | `0x292cc6d79e95b2848579735c24b70215179d4a33` |
| `gasfees` code fingerprint | `0xaa0637159eff2e99…` | `0xda2a2c1aada6bfde…` |
| permission implementation | `0xc96d1488fcdc32e2f61f32e01760ca0c4bad094e` | `0x7f31637245b89041173f7fe983705581c8f43685` |
| implementation code fingerprint | `0x7d3e843ac64de451…` | `0xf95f54632457a342…` |
| permission proxy admin | `0x1c217b46913464299313f2e2f6c936ed531251b0` | `0xd13cf1a85742a793336d2390c3c485896d536dfa` |
| proxy admin's owner | `0x0115bd31132b55e1fbcccbc40739b762693a7ce1` | `0x2538da23e6de29ade98c4cf6e1c4dca06d35116f` |

Only `permission` is a proxy (EIP-1967 implementation and admin slots set) on either network. The
registry, price feed and gas fee contracts are plain contracts, so they change by the registry
answering a different address, which is what `RegistryEntryChanged` reports.

## Replay: would it have caught 14 September?

`readSystemLogs` over mainnet blocks 3181701 to 3187700 (6,000 blocks, 60 windows of 100), watching the
permission proxy and its proxy admin. Three events, none of them announced by anyone:

| Block time (UTC) | Block | Contract | Event | Arguments |
|---|---|---|---|---|
| 2026-09-14T04:05:25Z | 3182106 | permission proxy | `RoleRevoked` | `DEFAULT_ADMIN_ROLE` from `0xe9ee1b2d0c5e14ffa8291dc70c6b1971b7177694`, sender `0x0115bd31132b55e1fbcccbc40739b762693a7ce1` |
| 2026-09-14T04:05:25Z | 3182106 | permission proxy | `RoleGranted` | `DEFAULT_ADMIN_ROLE` to `0x0115bd31132b55e1fbcccbc40739b762693a7ce1`, sender the same |
| 2026-09-14T04:30:35Z | 3182135 | proxy admin | `OwnershipTransferred` | from `0xe9ee1b2d0c5e14ffa8291dc70c6b1971b7177694` to `0x0115bd31132b55e1fbcccbc40739b762693a7ce1` |

The first two are the change RESEARCH.md recorded by hand on 15 September, matched to the second. The
third was not known until this run: 25 minutes later the right to upgrade the permission contract
moved to the same address, which the 15 September reading identified as a Safe. One Safe now holds
both the admin role on the mainnet permission contract and the ownership of its proxy admin.
The order of the first two rows is log order within the block as the RPC returned it.
