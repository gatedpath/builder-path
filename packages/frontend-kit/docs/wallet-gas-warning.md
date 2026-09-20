# The wallet gas warning

Vine's page on interacting with smart contracts carries a warning that every Redbelly dApp
should repeat near its first transaction. Read on 12 September 2026 at
https://vine.redbelly.network/smart-contracts/interaction/ (RESEARCH.md question 13):

> for most wallets, gas related information may not be handled accurately

The same page steers dApps to WalletConnect. Here is why the warning exists and what the kit does
about it.

## Why wallets get it wrong here

Gas on Redbelly is priced in US dollars, not in a fee market. A native transfer costs US$0.01 at
21,000 gas; an on-chain price oracle publishes the USD/RBNT rate and nodes read it at block
execution, so the base fee in wei moves with the RBNT price and `eth_maxPriorityFeePerGas` is
zero (https://vine.redbelly.network/network-fees/, and measured, RESEARCH.md question 6). Wallets
built for Ethereum assume a fee market: they estimate a priority fee, show "low, medium, high"
tiers that mean nothing here, sometimes display the fee in a fiat conversion that uses their own
price source rather than the network's oracle, and may warn about "high gas" when the number is
just the RBNT price doing its job.

The consequences for a dApp:

- The fee your app shows should come from the chain, not the wallet. `gasCostUsd` in
  `@gatedpath/chains` reads the base fee and the feed and returns RBNT and USD for a gas
  amount. `<GasWarning transferUsd={...}>` takes that figure.
- Never set fee fields in the transaction request. Leave `maxFeePerGas` and
  `maxPriorityFeePerGas` unset and let the client estimate; a hard-coded value copied from
  Ethereum will be wrong in one direction or the other. The scaffolder's wagmi config leaves them
  unset on purpose.
- There is nothing to bump. With no priority fee there is no "speed up" that does anything; a
  transaction that is not in the next block produced is not coming (RESEARCH.md question 4, blocks
  on demand). Tell the user to re-send rather than re-price.
- Show the warning once, near the first action, and link to Vine rather than restating the fee
  model. `<GasWarning>` links to the interaction page and the network-fees page.

## What the component says

"Gas on Redbelly is priced in US dollars and paid in RBNT; a plain transfer costs about US$X right
now. Redbelly warns that most wallets show gas information wrongly on this network, so trust the
figure here over the wallet's", followed by the two links. The X is whatever you pass in
`transferUsd`; the scaffolder's page fills it from `gasCostUsd({ gasUsed: 21_000 })`. Without a
figure the sentence drops the number rather than printing a stale one.
