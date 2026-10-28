# Card 15, ERC-3643 security token suite, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of testnet, and not further. The whole reference ERC-3643 suite (T-REX 4.1.3 and
ONCHAINID 2.2.1, installed from npm at pinned versions into a fresh `empty` scaffold) was deployed by a
deploy script of this run's own with no factory in the way: our own implementation authority, the six
implementations, the six proxies, the token's ONCHAINID, a claim issuer and a two-layer reader, 39
transactions and 22,862,717 gas on the fork, every owner role handed to an OpenZeppelin
`TimelockController` whose proposer and executor is the Safe's stand-in, the claim issuer's management key
on the Safe stand-in directly (finding 6 says why not the timelock). One test investor was registered
with an ONCHAINID and claims on the two topics the token requires, each claim signed by the claim
signer's key with `eth_sign` and added by the investor's own transaction; the token itself refused a
transfer to a wallet without those claims (`Transfer not possible`); `permission.isAllowed` was read
beside the registry for three wallets and the reader said which layer refused each; a claim was revoked
and a mint to its holder refused (`Identity is not verified.`). 31 tests pass in 4 suites (the template's
20 and 11 new ones, one a fuzz), covering a claim that is absent, valid, expired, revoked, on the wrong
topic and from an untrusted issuer, plus the timelock path. The strict linter fired once on code of this
run (an expiry is a `block.timestamp` comparison; silenced on that line with the reason), never on the
vendored code once its warnings were isolated the way `foundry.toml` allows; `forge fmt --check` is clean
after one reflow. Pre-flight clears 5 of 7: `DEPLOYER is a public address` is the expected failure before
a wallet is set, and `foundry.toml pins solc 0.8.30 and prague` is a real one that finding 1 explains and
the kit has to answer.

Timings. The scaffold: `npm create redbelly-dapp@latest card-15 -- --template empty --yes` finished in
0.28 s (the 0.2.1 tarball was in the npm cache; `--template empty` was accepted), `npm install` 32.5 s,
`npm run contracts:install` 2.8 s (forge-std only; the `empty` template's `contracts:install` does not
fetch OpenZeppelin by forge, it comes from npm with `npm install`), `npm run test` 1.2 s for the baseline's
20 tests and 0.8 s for the 31 after. The fork loop was ready in 19.3 s (5.9 s forking testnet at block
3,052,519, 7.6 s mocking the gate and seeding, 5.8 s deploying the template). The rehearsal ran in
21 s, pre-flight in 0.6 s. The session paused for about five hours (the agent hit its session limit
after reading the vendored sources, about 17:30, and resumed at 22:35:54); from the resume to the end of
the rehearsal: 11 min 16 s (22:35:54 to 22:47:10 local time), from the first green commit to the end of
the rehearsal 1 min 41 s. Reading the scaffold, the reference contracts and the identity partner's guide
before the pause took about twelve minutes from the scaffold at 17:17:38.

What the prompt asks for and this run did not do: the deploy on testnet, the Routescan verification and
the ship report (each needs a wallet-signed transaction, and the agent signs nothing on a real network),
the identity partner's own claims path (its guide names an SDK and an embedded wallet an agent cannot
hold; the claims here are signed by a test key in the scheme its reference ClaimIssuer checks), and a web
interface (the "interface" that says which layer refused is a contract, `GateReport.describe`, read from
the command line; no page was built). The card therefore says "proven on a fork" beside its date.
Nothing was signed or sent to a real network; the fork ran as chain 31337 and every sender was an
unlocked Anvil test account (indices 3, 4, 5, 7, 8 and 9; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1 (forge, anvil, cast), solc 0.8.30 and 0.8.17 (the
second fetched by forge for the vendored code). Project: a fresh scaffold made the same afternoon from
the published packages, `npm create redbelly-dapp@latest card-15 -- --template empty --yes`, `npm
install`, `npm run contracts:install`, committed as the baseline before the card began (20 tests green).
The scaffold's own source files are untouched: `git diff --stat` against the baseline shows nine new files
and four edited ones (`contracts/foundry.toml`, `contracts/remappings.txt`, `contracts/package.json` and its
lock file, each for the vendored code; findings 1 to 3), and `npm run dev` still deploys the template's
`GatedExample` exactly as shipped. Nothing under `vendor/` or `lib/` was changed.

## Where the card comes from

Card 15 was added on 11 October 2026 from another builder's question in the Redbelly Discord (RESEARCH
question 61): a private-debt proof of concept on testnet, the identity partner's guide pointing at a
pre-deployed T-REX factory, `deployTREXSuite` reverting for anyone but the factory's owner, and Redbelly's
reply that there is no official factory and to deploy your own stack. The write-up behind the card
(`research/idea-2026-10-11-erc3643-suite-draft.md`) sets the shape: the reference contracts installed into
the builder's own project as dependencies, our own MIT code around them, no factory of ours that others
deploy through. The register reader draft of 12 October confirmed the 4.1.x interface on a live mainnet
register and found that the largest register requires no claim topics and trusts no issuer, so its
registration alone is the gate; this run required two topics on purpose, so the claims machinery is the
thing exercised.

## The prompt, as run

> Install the reference ERC-3643 and ONCHAINID contracts into a fresh scaffold as dependencies and deploy
> the whole suite on testnet with a deploy script of your own: token, identity registry and its storage,
> trusted issuers registry, claim topics registry, compliance. No factory owned by someone else. Every
> admin role on a Safe behind the timelock. Deploy a claim issuer, register one test investor with an
> ONCHAINID and a claim for the topics the token requires, following the identity partner's integration
> guide, and show the token itself refuse a transfer to a wallet without that claim. Keep the network gate
> separate: read permission.isAllowed beside the registry and say in the interface which of the two layers
> refused. Tests for every state a claim can be in, pre-flight clean, verified on Routescan, a ship report.

## What was built (files beside this record)

The dependencies, in `contracts/package.json`: `@tokenysolutions/t-rex` 4.1.3 (the version the 44
registers on mainnet report from `version()`), `@onchain-id/solidity` 2.2.1, and OpenZeppelin 4.9.6 twice
under npm aliases (`oz4-contracts`, `oz4-contracts-upgradeable`) because the reference code is written
for OpenZeppelin 4.x while the scaffold's own code uses 5.6.1. Both reference packages' `LICENSE.md` files
read GPL-3.0 (finding 4). `contracts/remappings.txt` gains five lines, three of them context remappings
that send the vendored code's `@openzeppelin/*` imports to the 4.9.6 copies and leave ours on 5.6.1.
`contracts/foundry.toml` changes four things, each commented: solc is detected per file instead of pinned
(finding 1), compiler warnings from the four vendored folders are ignored (`ignored_warnings_from`; the
scaffold's `deny = "warnings"` still fails the build on ours), `node_modules/**/*` joins the linter's
ignore list, and `out/` gets read permission for `vm.getCode`.

`contracts/script/TrexArtifacts.sol`, 33 lines, `pragma solidity 0.8.17`: the one compilation unit of the
vendored code. It imports every reference contract the run uses so forge compiles their artifacts; nothing
else of this run is 0.8.17.

`contracts/src/interfaces/ITrex.sol`, 129 lines: the slice of the T-REX and ONCHAINID interfaces this
project calls, at 0.8.30, with the implementation authority's two structs. A 0.8.30 file cannot import
0.8.17 sources, so every call into the suite goes through these (finding 2).

`contracts/script/TrexSuite.sol`, 154 lines: `TrexSuiteDeployer`, the deploy shared by the script and the
tests. It takes a `Config` (deployer, admin, timelock delay, agent, claim signer, permission address, name,
symbol, decimals, claim topics) and returns the eleven addresses of a `Suite`. In order: the
`TimelockController` (proposer and executor the admin, no other admin, so it administers itself); our own
`TREXImplementationAuthority` as a reference contract with no factory, the six implementations created from
their artifacts, `addTREXVersion(4.1.3)` and `useTREXVersion`; the five registry and compliance proxies and
the `TokenProxy`, each initialised by its own constructor through the authority, with an ONCHAINID of the
token's own; the wiring (`bindIdentityRegistry`, `bindToken`, the claim topics); the reference `ClaimIssuer`
with the signer as a claim key (purpose 3) and the admin as its management key, the deployer's management
key removed; the issuer trusted for the topics; agents (the token on its registry, the operations wallet on
token and registry); the `GateReport`; and every `transferOwnership` to the timelock. The vendored
contracts are created with a `create` in assembly from `vm.getCode(artifact)` plus the encoded arguments.

`contracts/script/DeployTrexSuite.s.sol`, 129 lines, on the scaffold's `RedbellyDeployScript`: the
pre-flight first (chain id against the RPC's, the deployer's `isAllowed` on 151 and 153, `ADMIN_SAFE` a
Safe 1.4.1 with threshold two or more on mainnet), then `deploySuite` in one broadcast. Environment, all
public addresses: `ADMIN_SAFE`, `TOKEN_AGENT` (default the deployer, logged), `CLAIM_SIGNER` (default the
agent, logged), `TIMELOCK_DELAY` (default two days), `TOKEN_NAME`, `TOKEN_SYMBOL`, `TOKEN_DECIMALS`
(defaults "Card 15 Note", "C15", 0). On 151 it refuses unless the admin is a Safe and the agent and signer
are not the deployer. Off mainnet with a stand-in it says in capitals that the admin is not a Safe and what
the real deploy uses. The permission address is read from the bootstrap registry when it has code. It
writes `deployments/<chain>-TrexSuite.json` with every address and the two package versions, nothing
secret.

`contracts/script/RegisterInvestor.s.sol`, 57 lines: the agent's step. Deploys an ONCHAINID whose
management key is the investor, registers it with a country code, and prints for each required topic the
claim data (a reference hash; nothing personal) and the hash the claim signer signs.

`contracts/src/GateReport.sol`, 61 lines: the two layers read side by side. `check(wallet)` returns
whether the network gate is readable, whether it allows the wallet, and whether the register has verified
it; `describe(wallet)` returns one sentence naming the layer that refused. A page would call `describe`;
the rehearsal called it from `cast`.

`contracts/src/ExpiringClaimIssuer.sol`, 76 lines, MIT, on OpenZeppelin 5's `Ownable`, `ECDSA` and
`MessageHashUtils`: a claim issuer whose claims can expire, because the reference one has no such state
(finding 5). It answers the three questions the registry and the identity ask (`isClaimValid`,
`isClaimRevoked`, `revokeClaimBySignature`), the signed data carries `abi.encode(validUntil, reference)`,
and the signature scheme is the reference ClaimIssuer's (the prefixed hash of `(identity, topic, data)`),
so the same signer and the same tooling work for both.

`contracts/test/TrexSuite.t.sol`, 407 lines, 11 tests. The suite's shape (version "4.1.3", wiring, the
seven owners all the timelock, the proposer and executor roles, the agents, the issuer's keys, the deployer
holding nothing). The admin refused by `Ownable` when acting directly, the timelock refusing to execute
before its delay and executing after. The six claim states, each seen from `token.transfer` by a verified
holder of 1,000 units: a wallet not registered at all and one registered with an identity and no claim
(both refused, and the agent cannot mint to the second); two valid claims from the trusted issuer (10 units
move; a fuzz over any amount within the balance); one of the two required topics, then a topic the token
never asked for, then the missing topic completing it; two correctly signed claims from a second reference
ClaimIssuer not in the trusted registry, refused until the timelock trusts it two days later; a claim
revoked by the admin at once, the recipient refused as a receiver but still able to send what it holds, a
stranger unable to revoke; the reference issuer's claims still valid ten years on; and the
`ExpiringClaimIssuer` swapped in through the timelock, its claims accepted inside their 30 days and refused
the second after, malformed data refused, revocation working there too. The `GateReport` in all four
quadrants plus the case of a chain with no permission contract.

`scripts/rehearse-trex.sh`, 110 lines: the rehearsal below. The outputs beside this record:
`test-output.txt` (the 31), `rehearsal-output.txt`, `dev-loop-output.txt` (the fork loop's start),
`preflight-output.txt` (the final 5 of 7) and `31337-TrexSuite.json` (the deployment record from the fork).

## What the run found

**1. The reference contracts pin `pragma solidity 0.8.17;` exactly, in 97 of 99 files, and solc 0.8.17
knows neither prague nor cancun.** The scaffold's `solc_version = "0.8.30"` and the rules file's "never
below cancun" cannot both hold for this code. This run let forge pick the compiler per file
(`auto_detect_solc = true`): every file of the scaffold's and of this run's says 0.8.30 in its pragma and
compiles for prague as before; the vendored files compile with 0.8.17 for the newest EVM that compiler
knows, london, which is the code the 44 mainnet registers already run. Pre-flight's check `foundry.toml
pins solc 0.8.30 and prague` is a regular expression on the literal pin and fails. The kit has to decide
what the check means when a dependency cannot meet it; a template for this suite (the write-up's
`--template erc3643`) cannot ship until it does. Writing the literal back into a comment to satisfy the
regex was considered and not done.

**2. A 0.8.30 file cannot import a 0.8.17 source, so the suite is deployed from its compiled artifacts.**
Forge refuses a compilation unit that mixes the two ("Found incompatible versions"). The way through:
one 0.8.17 file that imports every vendored contract so their artifacts exist, `vm.getCode` plus a
`create` for every deploy, and slim 0.8.30 interfaces of this run's own for every call. `vm.getCode`
needs read permission on `out/` in `fs_permissions`, which the first test run said in plain words. The
cost is 129 lines of interface that mirror theirs; the gain is that the deploy script and the tests stay
at 0.8.30 with the scaffold's `RedbellyDeployScript` and OpenZeppelin 5.

**3. Two OpenZeppelin versions coexist through context remappings, and the order of `remappings.txt`
decides whether they work.** The vendored code is written for OpenZeppelin 4.x (`Ownable` without a
constructor argument, `OwnableUpgradeable`, `Initializable` from the upgradeable package); the scaffold
uses 5.6.1. Installed 4.9.6 twice under npm aliases and remapped by context
(`node_modules/@tokenysolutions/t-rex/:@openzeppelin/contracts/=node_modules/oz4-contracts/`). Placed
after the scaffold's global `@openzeppelin/contracts/=...` line the context remapping for `contracts/`
lost and 5.6.1 was pulled into the 0.8.17 unit; placed before it, all three won. `remappings.txt` also
takes no comments (forge reads every line as `key=value`), so the explanation lives in `foundry.toml`.

**4. Both reference packages are GPL-3.0 in the tarballs; npm's `license` field for ONCHAINID is wrong.**
The write-up's open "verify" is closed: `@tokenysolutions/t-rex` 4.1.3 says "SEE LICENSE IN LICENSE.md"
and the file is the GPL-3.0; `@onchain-id/solidity` 2.2.1 says `ISC` in `package.json` and its
`LICENSE.md` is also the GPL-3.0. The shape the write-up chose holds: theirs stays GPL in the builder's
`node_modules`, this run's files are MIT and import nothing of theirs (the interfaces are rewritten, not
copied). One file of this run inherits from nothing of theirs either; `ExpiringClaimIssuer` stands beside
the reference `ClaimIssuer` rather than on it, for the licence and for finding 5.

**5. "Expired" is not a state the reference claim issuer knows.** ONCHAINID's `ClaimIssuer` has two
answers for a claim, valid and revoked; `isClaimValid` checks the signer's key and the revocation list
and nothing about time, and it is not `virtual`, so expiry cannot be added by inheritance. The test
`test_claim_expired_referenceIssuerNeverExpires` says so: ten years on, still verified. The prompt's
"every state a claim can be in" therefore has five states on the reference suite (none, valid, revoked,
wrong topic, untrusted issuer) and a sixth only if the issuer implements it. This run's
`ExpiringClaimIssuer` does, by reading `validUntil` out of the signed claim data, so the expiry is bound by
the signature and the issuer only reads it; the token refuses the second after. The card's page should
say which it means. The identity partner's guide does not mention expiry at all.

**6. ONCHAINID's management key is one role for two jobs, so the claim issuer is managed by the Safe and
not by the timelock.** The management key adds and removes claim signers (an admin act) and revokes
claims (an operational one that must not wait two days). The prompt says every admin role behind the
timelock; this run put the claim issuer's management key on the Safe's stand-in directly and everything
that is `Ownable` (authority, token, the four registries, compliance) behind the timelock, and the deploy
script logs it. On the real network that Safe has a threshold of two or more, which is still a stronger
seat than the single operations key the guide's toolkit uses. The card's wording could carry the
exception or the kit could split the roles with a small proxy in front of the issuer; left for the lead.

**7. A T-REX token is born paused.** `Token.init` sets `_tokenPaused = true`; the first transfer tests
failed with `Pausable: paused`. `unpause` is an agent's call, so the register opens when the issuer's
operations wallet says so, after deploy, not inside it. The deploy script says so in its last log line and
the rehearsal has the step.

**8. The identity validates the claim with the issuer at the moment it is added, so a bad claim never
lands; every refused state arises afterwards.** `Identity.addClaim` calls `issuer.isClaimValid` and
reverts `invalid claim` otherwise. Revocation, expiry and a trust removed are all changes after the fact;
"wrong topic" and "untrusted issuer" are valid claims that the token's registry does not count. Also:
`addClaim` is the investor's own transaction (it needs the identity's management or claim key), which the
guide does not say. The guide names a `userIdentity` the issuer must already have and never says who
creates it or how, gives no claim scheme number and no signature recipe, uses topics `[1, 2]` without
saying what they mean, and its toolkit wants `PRIVATE_KEY` in an environment variable, which the
scaffold's rules forbid. This run creates the identity from the agent's wallet with the investor as its
management key, signs with `eth_sign` (the prefix the reference `isClaimValid` expects) from an unlocked
account, and uses topics 1 and 2 because the guide does. Each of those is a question for the identity
partner before a page says "following the integration guide".

**9. The agent role is operations, not admin, and the token must be an agent of its own registry.** The
operations wallet registers identities, mints, freezes and unpauses; none of that can wait out a delay, so
`TOKEN_AGENT` is a separate public address and the deployer holds no role when the script ends (tested).
`Token.recoveryAddress` writes to the identity registry, so the token itself is added as the registry's
agent, as the reference factory does.

**10. Pre-flight's secret scanner reads the investor record, not only transaction hashes.** The
`RegisterInvestor` script wrote the claim hashes (32 bytes, 64 hex characters) to
`deployments/31337-investor.json` for the signing step; pre-flight after the rehearsal fell to 4 of 7 on
`(hex64)`. The rehearsal now deletes that file once the claims are added; the deploy record of addresses is
fine. Card 9's finding 4 generalises: anything 32 bytes wide, written by any script, trips the scanner,
and the shared "how to repeat it" should say so.

**11. The fork's network gate is the dev loop's mock.** `npm run dev` replaces `permission` at the real
testnet address with a mock that lets Anvil accounts 2 to 6 and the deployer through, so the investor and
the stranger both read `isAllowed` true on the fork; the real gate on 153 would refuse every Anvil account.
The rehearsal says so and adds a wallet outside the mocked set, so `GateReport` shows three of its four
sentences on one fork: "allowed by both layers", "refused by the register; the network gate allows this
wallet", "refused by both layers". The fourth, network refused and register accepting, is the one a
verified-but-not-yet-Redbelly-verified investor would see, and only a real network shows it.

**12. Gas, for the faucet.** The suite's deploy on the fork: 39 transactions, 22,862,717 gas, which at
Redbelly's US$0.01 per 21,000 gas is about US$10.89, and at the testnet feed read on the fork
(`getLatestPrice()` 1809, so US$0.001809 per RBNT at timestamp 1792273345) about 6,018 RBNT: 13 claims
from a faucet that pays 500 RBNT per 24 hours. The dear items: the `Token` implementation 3,133,123, the
reference `ClaimIssuer` 2,746,407, the token's own ONCHAINID 2,393,909, the implementation authority
2,054,449, the `TimelockController` 1,608,964; the six implementations and the authority together are
about 10.7 million of the total, which a second register on the same authority would not pay again. Per
investor: an ONCHAINID 2,393,909, registration 79,566, two claims 312,037 and 312,025, about 3.1 million
gas, US$1.48. Opening the register 42,678, a mint 285,984, a revocation 58,255. The whole rehearsal,
26,347,171 gas, about US$12.55 or 6,935 RBNT, 14 faucet days. Fees on a fork mean nothing in RBNT; these
are gas counts and the feed's rate on the day.

**13. The linter bit once on code of this run, `forge fmt` reflowed five files.** The strict linter
accepted everything except the expiry comparison (`block-timestamp`), silenced on that line with the
reason beside it; the vendored code's own warnings never reached the build once `ignored_warnings_from`
named its four folders. `forge fmt --check` wanted five long lines wrapped. Card 9 found the opposite
balance (format once, lint never); card 13 the same as here.

**14. The register reader's finding holds from the other side.** `isVerified` returns true for any
registered wallet when the claim topics registry is empty, which is what the largest mainnet register
does. This run required two topics, and the test for a wallet registered with an identity and no claim
is refused, and the deploy script refuses a configuration with no topics in plain words, so a builder
cannot deploy a "claims" register that is a "registration only" one by accident.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Nine steps on a fork of testnet (chain 31337, fork of 153 at block 3,052,519, the rehearsal at
3,052,532), every signer an unlocked Anvil account: the network gate's address resolved from the bootstrap
registry; the suite deployed through its script from account 8 with account 9 as `ADMIN_SAFE` (the base
pre-flight saying "ADMIN_SAFE is not a contract; allowed on this chain but put a Safe there before
mainnet", the script saying in capitals what the real deploy uses), account 7 as the agent and account 5
as the claim signer, 39 transactions and 22,862,717 gas summed from the broadcast receipts; the suite read
back (version "4.1.3", paused, every owner the timelock, topics [1, 2], one trusted issuer, the signer's
claim key and the stand-in's management key present and the deployer's absent, the agent on the token and
the deployer not); the agent registering account 3 with an ONCHAINID and country 36, `contains` true and
`isVerified` false before any claim; `eth_sign` by account 5 of each topic's hash and the investor's own
`addClaim` for each (312,037 and 312,025 gas), `isVerified` true after both; the agent unpausing and
minting 1,000; the investor's transfer of 10 to account 4 refused by the token, `Transfer not possible`,
balances unchanged; the two layers for three wallets (investor: gate true, register true, "allowed by both
layers"; stranger: gate true under the mock, register false, "refused by the register ..."; account 9,
outside the mock: both false, "refused by both layers"); the stand-in revoking the topic-1 claim by its
signature, `isVerified` false, a mint to the investor refused `Identity is not verified.`; the stand-in's
direct `addClaimTopic` refused `Ownable: caller is not the owner` with the timelock's delay read back as
172,800 s. The saved transcript came from the script before its last change, which only added the
deletion of the investor record (finding 10).

## Not done

- **Testnet deploy, Routescan verification, the ship report.** All in the prompt; all need a wallet-signed
  transaction, and the agent signs nothing on a real network. The deploy script takes no arguments beyond
  the public addresses above; `ADMIN_SAFE`, `TOKEN_AGENT` and `CLAIM_SIGNER` are the three to set first.
  Verification is seventeen contracts (six implementations, six proxies, the authority, the timelock, the
  token's ONCHAINID, the claim issuer, the reader), the vendored ones under solc 0.8.17 and their own licence.
- **The identity partner's claims path.** The guide's SDK, embedded wallet and `manage:claims` toolkit were
  not run; the claims here use the scheme its reference ClaimIssuer checks and a test signer. Finding 8
  lists the questions.
- **A web interface.** `GateReport.describe` is the sentence a page would show; no page was built, and the
  web app was not touched, so `typecheck` and `build` were not run for this card.
- **Compliance modules.** `ModularCompliance` was deployed with no module bound, so `canTransfer` is true
  for every pair; country limits, holder caps and lock-ups are the next card's work.
- **The upgrade path through the authority** (`changeImplementationAuthority`, a second version) and the
  token's freeze, recovery and forced-transfer functions: deployed, not exercised.
- **Slither and Aderyn** were not run on this card; `npm run gas` was not run.
- **A second agent.** The plan asks for two.
- **The hand-written project page, the concept page on the two identity layers, and the terminal
  recording.**
- **The kit's answer to finding 1** (what the solc pin check means for a dependency that cannot meet it)
  and a decision on finding 6 (the claim issuer's management key). Left for the lead.

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-15 -- --template empty --yes
cd card-15 && npm install && npm run contracts:install
git init && git add -A && git commit -m baseline
cd contracts && npm install --save-dev @tokenysolutions/t-rex@4.1.3 @onchain-id/solidity@2.2.1 \
  oz4-contracts@npm:@openzeppelin/contracts@4.9.6 oz4-contracts-upgradeable@npm:@openzeppelin/contracts-upgradeable@4.9.6
cd ..
# copy the files beside this record where their names say; foundry.toml and remappings.txt replace the
# scaffold's (the diff is the commented block and the five remapping lines, context remappings first)
npm run test                                   # 31 tests, 4 suites
(cd contracts && forge fmt --check src script test)
npm run dev -- --no-web --port 8555            # leave it running
bash scripts/rehearse-trex.sh > ../card-15-rehearsal-output.txt   # outside the tree: findings 10 and card 9's 4
npm run preflight                              # 5 of 7; DEPLOYER expected, the solc pin is finding 1
```
