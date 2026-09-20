# @gatedpath/frontend-kit

```
For agents
- One hook: `useEligibility(address, verifier, requestId, options?)`. It reads the network gate
  (`permission.isAllowed`) and the dApp's gate (`verifier.isEligible`), caches both, refetches on
  a new block or every 30 s, and exposes `refresh()`. Don't poll the RPC yourself around it.
- Five states, one component each, or `<EligibilityGate>` to pick for you: `disconnected`,
  `unverified`, `ineligible`, `eligible`, `expiring` (plus `checking` and `error`). The gate is the
  contract; these components decide what a button says, never whether a transaction may run.
- `expiring` only shows when the verifier can tell. `ReceptorMock` can (`receptorMockExpiry`);
  real verifiers can't, so leave `expiry` unset on mainnet.
- Never suggest anvil's default accounts anywhere: they pass `isAllowed` on the real networks
  (RESEARCH.md question 30). `test/hygiene.test.ts` fails the build if one appears.
- Show `<GasWarning>` near the first transaction; docs/wallet-gas-warning.md says why.
- `explainError(error)` turns a viem or wagmi error into the plain words from the shared failure
  table (`@gatedpath/agent-rules/failures`): NotEligible (with the credential state when you pass
  one), a wallet rejection, a wrong chain, not enough RBNT. Show `plainWords` and `fix.link`, never
  `error.message` alone; `kind: "unknown"` carries the error's own words in `raw`.
- Build: `npm run build`. Tests: `npm test` (Vitest, jsdom, a mocked transport; no network).
```

The frontend kit from `PLAN.md` section 5.6: React components for the states every Redbelly dApp
has and most will get wrong, and a hook that reads eligibility once and caches it so the UI does
not hammer the RPC. wagmi 3 and viem 2 as peers, headless with a small default style that takes
its colours, radii and type from the site's design tokens.

## The hook

```tsx
import { useEligibility } from '@gatedpath/frontend-kit';

const eligibility = useEligibility(address, verifier, requestId, {
  refreshInterval: 30_000, // floor; every new block also refetches
  watchBlocks: true,       // eth_blockNumber polled by wagmi, reads refetched only when it changes
  expiry: receptorMockExpiry(publicClient, verifier), // testnet and forks only
  expiringWindowSeconds: 7 * 86_400,
});
// eligibility.state, .isAllowed, .isEligible, .expiresAt, .secondsToExpiry,
// .lastCheckedAt, .blockNumber, .isFetching, .error, .refresh()
```

Two reads, both `view`: the network's permission contract (address from
`@gatedpath/chains` for the current chain, or `options.permission`) and the dApp's verifier
behind `IRedbellyVerifier.isEligible(wallet, requestId)` from receptor-mock. wagmi batches them
through Multicall3, which is deployed on both networks, so one `eth_call` per refetch. Results are
cached by wagmi's query client under the wallet, verifier, request id and chain, so every
component asking the same question shares one read.

Why block-or-30-seconds: blocks on Redbelly are produced on demand (RESEARCH.md question 4). A
busy chain gives you a block every few seconds and the reads follow it; a quiet chain gives you
none, and then a credential that was revoked off-chain would never show until the next block, so
the interval is the floor. `refresh()` is for the moment after the user comes back from
access.redbelly.network.

State derivation, in order: no address is `disconnected`; nothing cached and an RPC error is
`error`; nothing cached yet is `checking`; `isAllowed` false is `unverified` whatever the verifier
says; `isEligible` false is `ineligible`; `isEligible` true with an expiry inside the window is
`expiring`; otherwise `eligible`.

## The components

| Component | State | Says |
|---|---|---|
| `NotConnected` | `disconnected` | Connect a wallet; identity is per wallet here |
| `NotVerified` | `unverified` | The wallet is not allowed to transact; link to access.redbelly.network, the faucet on testnet, don't switch wallets |
| `Ineligible` | `ineligible` | Verified on the network but no accepted proof for this action; the answer is a plain yes or no |
| `Eligible` | `eligible` | Wraps your action |
| `ExpiringSoon` | `expiring` | Wraps your action and says when the credential expires |
| `Checking`, `EligibilityError` | `checking`, `error` | In flight; the RPC failed and nothing is cached, with a retry |
| `EligibilityGate` | any | Picks one of the above from the hook result; `render` overrides any state |
| `LastChecked` | | "Last checked at block N" with a refresh button |
| `GasWarning` | | Vine's wallet gas warning, with a live USD figure if you pass one |

Each renders plain elements with `rb-elig-*` class names. Import
`@gatedpath/frontend-kit/styles.css` for the default look, which reads the site's
`--rb-*` and `--sl-*` tokens with their light values as fallbacks, so it follows the site's dark
theme when `tokens.css` is loaded and looks the same on its own. Or skip the stylesheet and style
the class names.

## A page

```tsx
const { address } = useConnection();
const eligibility = useEligibility(address, verifier, requestId);
return (
  <>
    <EligibilityGate eligibility={eligibility} address={address} chainName={chain.name} testnet={chain.testnet}>
      <button onClick={subscribe}>Subscribe</button>
    </EligibilityGate>
    <LastChecked eligibility={eligibility} />
    <GasWarning transferUsd={usd} />
  </>
);
```

The scaffolder's `web/` app has this as a working page at `/eligibility`
(`templates/web/src/app/eligibility/page.tsx`): it reads the template contract's `verifier()` and
`requestId()`, uses `receptorMockExpiry` on testnet, and prices the gas figure from the on-chain
feed with `gasCostUsd` from `@gatedpath/chains`.

## The dev entry: `@gatedpath/frontend-kit/dev`

The local loop from PLAN.md 18.1. `DevStatePanel` lists the five wallets `npm run dev` seeded
in a scaffold, marks the connected one, and flips the connected wallet through NeverIssued,
Valid, Expired, Revoked and WrongJurisdiction by calling `setStatus` on the `ReceptorMock` as the
deployer through Anvil's impersonation RPC (`anvil_impersonateAccount`, then stop). It fires
`notifyEligibilityChanged(wallet)`, which every mounted `useEligibility` for that wallet listens
to, so the page moves into the new state without a reload or a new block. `anvilAccountConnector`
is a wagmi connector for one of Anvil's unlocked accounts: the node signs, the browser never holds
a key. Its style is `@gatedpath/frontend-kit/dev.css`, kept apart from `styles.css` so a
production bundle that loads the main stylesheet carries nothing of the panel. `parseLocalDeployment` reads `deployments/local.json` as `scripts/dev.mjs` writes it and
refuses anything that isn't chain 31337 with five wallets on accounts 2 or later.

The panel renders only on chain 31337. On 151 or 153 it renders nothing whatever it is given,
and the scaffold imports it only in the dev server behind a build-time constant, so a production
bundle carries none of it; the scaffolder's integration test builds one and checks.

## Tests

`npm test`: 80 Vitest tests in jsdom. `test/mock-chain.tsx` is a wagmi config over a `custom`
transport that answers `eth_chainId`, `eth_blockNumber`, `eth_call` and Multicall3 `aggregate3`
from an in-memory state the tests mutate; nothing leaves the process and no address in it exists
anywhere. The hook tests cover every state, that reads happen once and then only on a new block,
manual refresh without a block, shared reads, the expiry window, errors and `enabled: false`. The
component tests render every state, the gate's selection and override, the links (Access dApp,
faucet, Vine) and the retry and refresh buttons. `test/dev-panel.test.tsx` runs the dev panel
against a fake chain 31337 (and proves it renders nothing on 153 or 151), including the
impersonate, send, stop sequence and the refetch without a new block. `test/hygiene.test.ts` walks every file in the
package and fails on any of anvil's ten default accounts or any 64-hex value.

Not tested: a real wallet. Nothing here signs; the kit reads and renders.

## Not in v1

Storybook (optional in the brief, skipped). A connect button (wagmi's own connectors and the
scaffolder's `Connect` component do that). Anything that calls the Eligibility SDK: the kit tells
the user they are ineligible, and the SDK is the thing that can tell them why; the scaffolder's
`web/src/eligibility/` has the steps for adding it.

## explainError

```tsx
import { explainError } from '@gatedpath/frontend-kit';

const write = useWriteContract();
// …
{write.error && <p>{explainError(write.error).plainWords}</p>}
```

`explainError(error, { eligibilityStatus? })` walks the error's `cause` chain and answers
`{ kind, plainWords, cause, fix: { command?, link? }, title?, docsPage?, notEligible?, selector?, raw }`
from the failure table in `@gatedpath/agent-rules/failures`, the same table the MCP server's
`explain_failure` and the site's `/errors` page read. It decodes a `ContractFunctionRevertedError`
by its revert data (a `NotEligible(wallet, requestId)` selector, `ZeroVerifier`, or an
`Error(string)` reason from the deploy script) or by the error name viem decoded, and recognises
`UserRejectedRequestError` (or an EIP-1193 code 4001), `ChainMismatchError`, `SwitchChainError` and
`InsufficientFundsError` by class wherever they sit in the chain. Pass `eligibilityStatus` when the
page already knows the state behind a `NotEligible` (a `ReceptorMock` can say; a real verifier
can't) and the entry for that state comes back. Anything else is `kind: "unknown"` with the
error's own message in `raw`, never a guess. Pure: no network, no React. The scaffold's web app
renders it in `web/src/components/FailureWords.tsx` under the gated button and the eligibility page.
