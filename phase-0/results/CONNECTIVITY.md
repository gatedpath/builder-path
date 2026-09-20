# Connectivity test, 12 September 2026

Run from a Claude Code cloud session whose environment allows Redbelly's hosts. Command:
`curl -sS -o /dev/null -w "%{http_code}" --max-time 15 https://<host>/` at 08:25 UTC.

| Host | HTTP status | Note |
|---|---|---|
| vine.redbelly.network | 200 | |
| docs.redbelly.network | 200 | |
| redbelly.network | 200 | |
| access.redbelly.network | 200 | |
| redbelly.routescan.io | 403 | root page refuses curl; see below |
| api.routescan.io | 404 | host reachable, root path has nothing |
| governors.testnet.redbelly.network | 200 | `eth_chainId` returns 0x99 (153) |
| governors.mainnet.redbelly.network | 200 | `eth_chainId` returns 0x97 (151) |
| chainlist.org | 200 | |
| arxiv.org | 200 | |
| docs.goldsky.com | 308 | redirect, reachable |
| github.com | 400 | root only; repo pages tested separately below |

Both RPC endpoints answer JSON-RPC. `web3_clientVersion` on both reports
`./linux-amd64/go1.25.14`, a Go client that does not identify itself as geth.

This is the first session in which the Redbelly hosts were reachable. The 11 and 12
September sessions before it got 000 on every one of them.
