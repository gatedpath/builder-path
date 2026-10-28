# Gated liquidity pool: the trade-offs

Card 10 of the Redbelly builder path. Stock Uniswap v2 core (v1.0.1, vendored in `lib/v2-core`),
ported to Solidity 0.8.30, with two gates added. This file is the written-down part of the prompt:
"document the trade-offs". Each entry says what was chosen, what it costs, and what the other
choice would have cost.

## 1. The gate is on the wallet that receives the position, not on the transaction sender

`mint(to)` and every liquidity-token transfer check `to` against the AU wholesale investor recipe
(request id 708) through the factory's `Gated` base. `msg.sender` is not checked. A liquidity token
can therefore sit only in a wallet that holds an accepted proof, whoever sent the tokens in.

Why: Uniswap's pair is meant to be called by a router, and a router has no credential. Gating
`msg.sender` would gate the router and nothing else. Gating the holder gates the economic position.

Cost: a wallet without the credential can fund a position that lands in a wholesale wallet. The
chain shows the money came from elsewhere, and the credentialed wallet holds the exposure; whether
that is a problem is a question for the offer document, not the contract.

## 2. Exit is always open; the kit token freezes instead

A holder whose credential expired or was revoked can still move liquidity tokens into the pair and
`burn`. The scaffold's `GatedERC20` takes the other view: a lapsed holder is frozen until a
compliance officer moves the balance.

Why: the prompt gates "pool entry". Providing liquidity is the regulated act; taking one's own
assets back is not, and an accountant's certificate lapses every two years. Trapping a position
behind a lapsed certificate would need a compliance role with a forced-transfer power that
Uniswap's pair does not have and this card did not add.

Cost: the pool cannot hold a position hostage for a regulator. If that power is wanted, it is a
`forceBurn` on the pair behind a role, and a migration of this contract.

## 3. Swaps check the recipient against the network gate, not the sender

`swap`, `burn` and `skim` require `to` to pass `permission.isAllowed`, the contract the bootstrap
registry names `permission`, or to be another pair of this factory. The sender is not checked by
the pair, because the chain already refused any transaction from an unverified wallet.

Why: `to` can be any address, and the pool's assets should land only where the network would let a
wallet transact. Allowing pairs of this factory keeps multi-hop routing possible.

Cost one: the pair reads `permission.isAllowed` on every swap, one external call. Cost two: on an
Anvil fork the network gate is not enforced for senders, so an unverified Anvil account can send a
swap whose output goes to a verified wallet; on 151 and 153 that transaction never enters a block.
Cost three: a contract that is not a pair of this factory cannot receive swap output. That
includes flash-swap borrowers (`data.length > 0` with a contract `to`), aggregators, and routers
of another factory. Flash swaps are therefore off in practice. A deployment that wants them adds
an allow-list of contracts on the factory, which is one mapping and one owner setter, and a line in
its threat model about who decides what goes on it.

## 4. One gate configuration per factory, not per pair

The factory is the one `Gated` contract; every pair asks it. The owner repoints the verifier, the
request id or the permission contract once for every pool.

Why: a pool operator that admits wholesale investors admits them to every pair. The kit's
`assertRevertsForAllInvalidStates` still proves each pair, because the factory's `NotEligible`
revert bubbles up through the pair unchanged.

Cost: no pair can carry a different recipe. A venue that wants a retail pair beside a wholesale pair
deploys a second factory.

## 5. The protocol fee recipient is minted without the provider gate

`_mintFee` mints the protocol's share of liquidity tokens to `feeTo` through `_mintUnchecked`.

Why: `feeTo` is the operator's treasury, named by the owner, not an investor. If the gate applied
and the treasury could not pass it, every `mint` and `burn` in every pair would revert, and a
lapsed treasury credential would freeze the venue.

Cost: one wallet holds liquidity tokens without the credential. Its tokens still obey the transfer
gate, so they can only move to a wholesale wallet or back into the pair to burn.

## 6. `createPair` is open

Anyone the chain lets transact can create a pair, as in stock Uniswap. Creating a pair places no
money in it.

Cost: pairs for tokens the operator never meant to list can exist on the factory. They hold nothing
until a wholesale wallet funds them.

## 7. Not the fork the prompt names

The prompt says "the forked Uniswap interface in the Redbelly GitHub org". That repository
(`redbellynetwork/interface`) is a mirror of Uniswap's front-end monorepo with no Redbelly commit
and no Solidity in it. This build therefore uses stock `Uniswap/v2-core` v1.0.1 as the base and
ports its three contracts to 0.8.30. The port keeps the maths line for line and changes: `SafeMath`
for checked arithmetic (with `unchecked` where the stock code wants the overflow), OpenZeppelin's
`SafeERC20`, `Math.sqrt` and `Math.min`, a transient-storage reentrancy lock, and the ABI of
`IUniswapV2Pair` and `IUniswapV2Factory` taken from the vendored interfaces so a v2 router or
front end speaks to it unchanged. `feeToSetter` is the OpenZeppelin owner under Uniswap's name.

Cost: the pair's init code hash is not Uniswap's, so a stock `UniswapV2Library.pairFor` computes
the wrong address; a router for this factory must take the hash from `type(GatedPair).creationCode`.
