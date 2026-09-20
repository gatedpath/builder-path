/** The same text is in README.md. Paste it into a rules file or system prompt. */
export const agentNotes = `Redbelly Network, facts for a coding agent (verified 2026-09-12).
Chain IDs: 151 mainnet, 153 testnet. Native coin RBNT, 18 decimals.
RPCs: https://governors.mainnet.redbelly.network and https://governors.testnet.redbelly.network. Ankr also serves mainnet at https://rpc.ankr.com/redbelly_mainnet.
Explorers: https://redbelly.routescan.io (151) and https://redbelly.testnet.routescan.io (153), Etherscan-style API under https://api.routescan.io/v2/network/{mainnet,testnet}/evm/{151,153}/etherscan/api.
Gas model in one sentence: gas is priced in US dollars (a 21,000-gas transfer costs US$0.01) and converted to RBNT at execution from an on-chain price feed, so RBNT fees move with the RBNT price and the priority fee is always zero.
Every wallet must pass isAllowed before it can transact: permission.isAllowed(address) on the contract the bootstrap registry (0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5, both chains) names as "permission" must return true, which requires identity verification at https://access.redbelly.network. Check it before deploying or sending.
Compile for prague with solc 0.8.30. Transient storage, PUSH0, MCOPY and the Prague precompiles are all present.
Blocks are produced on demand; poll aggressively. There is no block cadence: with no traffic there is no block, and a transaction lands within seconds or not at all. Do not sleep for a block time.
No debug or trace RPC methods. debug_* and trace_* are not served by the governors endpoints; net_version is not served either.`;
