<!-- redbelly-ship chain=153 date=2026-10-23 ok=true generatedAt=2026-10-23T15:01:37.499Z -->
# Ship report: chain 153 (testnet), 2026-10-23

Written by `redbelly ship` 0.2.1 at 2026-10-23T15:01:37.499Z for `~/code/first-153/contracts` at commit `58608ec72ce0`, read-only against https://governors.testnet.redbelly.network. Every check passed with 1 warning; the deploy script accepts a broadcast on chain 153 dated today with this file present. Nothing here signs. The deployer's address came from `cast wallet address --account rbn-testnet`; the key stayed in the keystore.

## Checks

| Check | Result | Reason |
|---|---|---|
| `gas` | pass | 35 rows priced at block 3,055,909: base fee 304,859.46 gwei, RBNT US$0.001562; GatedERC20 deploys for 1,972,221 gas = 601.2502 RBNT = 93.92 US cents. |
| `chain-id` | pass | --chain says chain 153 and the RPC reports 153. |
| `deployer-verified` | pass | 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59 (cast wallet address --account rbn-testnet) passes permission.isAllowed on chain 153. |
| `admin-safe` | skip | No admin given; pass --admin <0x…> with the address that will own the deployed contracts. |
| `compiler-pins` | pass | ~/code/first-153/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague. |
| `git-secrets` | pass | No secret-shaped line added in 1 commits, and no .env file is tracked. |
| `balance` | pass | 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59 holds 41499.3024 RBNT; 1,972,221 gas costs about 601.2502 RBNT (US$0.9392) and 751.5627 RBNT covers it with 25% margin. |
| `slither-report` | pass | reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 3 .sol file(s) under src. |
| `verifier` | warn | No VERIFIER: the deploy script will deploy a ReceptorMock on 153 and every wallet starts ineligible. Fine for testnet; mainnet refuses. |
| `tests` | pass | 86 passed, 0 failed. |
| `five-state-tests` | pass | 4 suites inherit GatedTest and pass: AdminPatternTest (7), GatedERC20FuzzTest (4), GatedERC20Test (23), IssuerRegistryTest (7). |

## Deployer and admin

Deployer 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59: `permission.isAllowed` true.
Admin: none given; on 153 the deployer holds every role.
Verifier: none; the deploy script deploys a ReceptorMock on 153. Request id the deploy script's default (18, the over-18 recipe).

## Contracts

### GatedERC20 at 0x080123b7a13c3aF4497618B8eAC4C97A5740B224

Record `deployments/153-GatedERC20.json`, deployed by 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59, admin 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59, verifier 0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73, request id 18. Explorer: https://redbelly.testnet.routescan.io/address/0x080123b7a13c3aF4497618B8eAC4C97A5740B224/contract/153/code

Constructor `constructor(string,string,(address,address,address,address),address,uint64,uint256)`, arguments as encoded by the deploy script:

```
0x0000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000016000000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b59000000000000000000000000017b98c2b39e26435f9ad3880101f9f1c5fdbe7300000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000b476174656420546f6b656e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000447544f4b00000000000000000000000000000000000000000000000000000000
```

Verify on Routescan:

```sh
forge verify-contract 0x080123b7a13c3aF4497618B8eAC4C97A5740B224 src/GatedERC20.sol:GatedERC20 --verifier etherscan --verifier-url https://api.routescan.io/v2/network/testnet/evm/153/etherscan --etherscan-api-key verifyContract --chain 153 --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args 0x0000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000016000000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b5900000000000000000000000038d8fd4d6bad7af440ed5d35a4e381f5f2936b59000000000000000000000000017b98c2b39e26435f9ad3880101f9f1c5fdbe7300000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000000000000000000b476174656420546f6b656e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000447544f4b00000000000000000000000000000000000000000000000000000000 --watch
```

### RecipientGuard at 0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73

Record `deployments/153-RecipientGuard.json`, deployed by 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59, admin 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59. Explorer: https://redbelly.testnet.routescan.io/address/0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73/contract/153/code

The record carries no constructor arguments (written by an older deploy script); encode them with `cast abi-encode` for the command below.

Verify on Routescan:

```sh
forge verify-contract 0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73 src/RecipientGuard.sol:RecipientGuard --verifier etherscan --verifier-url https://api.routescan.io/v2/network/testnet/evm/153/etherscan --etherscan-api-key verifyContract --chain 153 --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args <cast abi-encode output> --watch
```

## Gas

Priced at block 3,055,909: base fee 304,859.46 gwei, RBNT US$0.001562 on the feed at 0xBf207257412D3672F9C772ef263583611B98039a (2026-10-23T14:57:47.000Z). Gas is priced in US dollars on this chain and converted to RBNT at execution, so the cents column is the stable one.

Deployment of GatedERC20: 1,972,221 gas = 601.2502 RBNT = 93.92 US cents. Pre-flight's balance check used 1,972,221 gas with 25% on top.

| Function | Gas | RBNT | US cents |
|---|---:|---:|---:|
| `GatedERC20:deployment` | 1,972,221 | 601.2502 | 93.915 |
| `GatedERC20:COMPLIANCE_ROLE()` | 307 | 0.0935 | 0.014 |
| `GatedERC20:DEFAULT_ADMIN_ROLE()` | 348 | 0.1060 | 0.016 |
| `GatedERC20:ISSUER_ADMIN_ROLE()` | 327 | 0.0996 | 0.015 |
| `GatedERC20:PAUSER_ROLE()` | 348 | 0.1060 | 0.016 |
| `GatedERC20:approve(address,uint256)` | 46,391 | 14.1427 | 2.209 |
| `GatedERC20:balanceOf(address)` | 2,643 | 0.8057 | 0.125 |
| `GatedERC20:burn(uint256)` | 32,690 | 9.9658 | 1.556 |
| `GatedERC20:canIssue(address,uint256)` | 8,089 | 2.4660 | 0.385 |
| `GatedERC20:canSubscribe(address)` | 6,918 | 2.1090 | 0.329 |
| `GatedERC20:canTransfer(address,address,uint256)` | 14,299 | 4.3591 | 0.680 |
| `GatedERC20:distribute(address[],uint256[])` | 73,738 | 22.4797 | 3.511 |
| `GatedERC20:forceTransfer(address,address,uint256,bytes32)` | 36,161 | 11.0240 | 1.721 |
| `GatedERC20:grantRole(bytes32,address)` | 56,331 | 17.1730 | 2.682 |
| `GatedERC20:hasRole(bytes32,address)` | 2,771 | 0.8447 | 0.131 |
| `GatedERC20:isActiveIssuer(address)` | 2,963 | 0.9032 | 0.141 |
| `GatedERC20:issuerPermission(address)` | 7,312 | 2.2291 | 0.348 |
| `GatedERC20:mint(address,uint256)` | 43,202 | 13.1705 | 2.057 |
| `GatedERC20:pause()` | 38,174 | 11.6377 | 1.817 |
| `GatedERC20:paused()` | 2,371 | 0.7228 | 0.112 |
| `GatedERC20:remainingIssuance(address)` | 7,233 | 2.2050 | 0.344 |
| `GatedERC20:renounceRole(bytes32,address)` | 27,757 | 8.4619 | 1.321 |
| `GatedERC20:requestId()` | 2,393 | 0.7295 | 0.113 |
| `GatedERC20:revokeIssuer(address)` | 27,156 | 8.2787 | 1.293 |
| `GatedERC20:revokeRole(bytes32,address)` | 29,045 | 8.8546 | 1.383 |
| `GatedERC20:setIssuer(address,uint64,uint64,uint256)` | 43,662 | 13.3107 | 2.079 |
| `GatedERC20:setRequestId(uint64)` | 27,235 | 8.3028 | 1.296 |
| `GatedERC20:setSubscriptionsOpen(bool)` | 30,141 | 9.1887 | 1.435 |
| `GatedERC20:setVerifier(address)` | 26,260 | 8.0056 | 1.250 |
| `GatedERC20:subscribe()` | 46,845 | 14.2811 | 2.230 |
| `GatedERC20:totalSupply()` | 2,381 | 0.7258 | 0.113 |
| `GatedERC20:transfer(address,uint256)` | 32,749 | 9.9838 | 1.559 |
| `GatedERC20:transferFrom(address,address,uint256)` | 42,792 | 13.0455 | 2.037 |
| `GatedERC20:unpause()` | 25,553 | 7.7900 | 1.216 |
| `GatedERC20:verifier()` | 2,368 | 0.7219 | 0.112 |

## Tests

`forge test`: 86 passed, 0 failed on forge 1.7.1. Five-state suites (inherit `GatedTest`): AdminPatternTest 7 passed, 0 failed; GatedERC20FuzzTest 4 passed, 0 failed; GatedERC20Test 23 passed, 0 failed; IssuerRegistryTest 7 passed, 0 failed.

## Static analysis

Slither: pass. reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 3 .sol file(s) under src.

## Compiler

solc 0.8.30, EVM prague, optimizer runs 200, forge 1.7.1. Both networks run Prague and Vine states 0.8.30.

## What this report does not prove

Monitoring live (the ops kit's alert poller on this contract), a `security.txt` at the web app's root, an audit or a bug bounty, and that the Safe's owners are the people you think. The builder site's review page lists them in order; tick them by hand under this line before mainnet.
