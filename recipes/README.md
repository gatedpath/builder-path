# Eligibility recipes

```
For agents
- A recipe is a declared criterion, not a KYC flow. Issuers verify people; the dApp names the
  credential an action needs. Pick the recipe, bind its request id to Gated, run the five states.
- Anything marked "verify" in recipe.json is not pinned by Redbelly's docs. Do not resolve it by
  guessing; ask, or test against a real verifier on 153, then record the answer in RESEARCH.md.
- Never put the underlying attribute (a birth date, a name, an accountant's email) on chain or
  in a log. The chain sees a request id and a boolean.
```

The eligibility library from PLAN.md section 12.1, first four entries. Each folder holds
`recipe.json`, the data (the criterion in plain language, the query shape, the credential
type and issuer, the on-chain binding, the five-state expectations, the privacy note, the
sources, the open questions), and `README.md`, the same in prose for a person or a regulator.
Both say the same thing; `check.mjs` (`node recipes/check.mjs`) confirms every recipe carries
every section, every `verify` marker states why, and every source carries a date.

| Recipe | Criterion in one line | Mechanism | Open |
|---|---|---|---|
| `over-18/` | Born at least eighteen years before today | Iden3 on-chain single query, `birthDate $lt <cutoff>` on an ID credential | circuit id, mainnet issuer DIDs, expiry handling, proof staleness |
| `au-wholesale-investor/` | An accountant has certified the holder as a sophisticated or wholesale investor | Iden3 on-chain query on `AUSophisticatedWholesaleInvestorCredential`, proof of issuance | the proof-of-issuance query shape, certification values, the legal test |
| `accredited-issuer/` | Holds a credential from one named accredited issuer | Any Iden3 query with `allowedIssuers` pinned; AML/CTF status as the worked example | mainnet issuer DIDs, the registry ABI |
| `business-delegate/` | Is an authorised delegate or representative of a verified business | A `hasRole` read on the business's `BusinessIdentifier` contract, no ZK proof | which credential backs the deployment, delegate linkability |

## What every recipe rests on

Redbelly's Proof by Query path (docs.redbelly.network/pages/methods/proof-by-query/): the
dApp deploys a contract inheriting Iden3's `ZKPVerifier`, calls `setZKPRequest` with a query,
the holder's wallet checks revocation against the reverse hash service, generates a proof and
calls `submitZKPResponse`; the contract records that `(wallet, requestId)` has an accepted
proof. `Gated` from `@gatedpath/receptor-mock` binds one request id and asks
`isEligible(wallet, requestId)` through `Iden3VerifierAdapter`; `ReceptorMock` stands in for
the verifier in tests and puts any wallet into any of the five states.

The query language is Iden3's (docs.redbelly.network/pages/eligibility-sdk/configure-eligibility-criteria/):
`context` (a JSON-LD schema URL from the `receptor-schema` repository), `type`, `allowedIssuers`,
`credentialSubject` with an operator from `$eq $ne $in $nin $lt $lte $gt $gte $between $nonbetween $exists`,
and a circuit id. On-chain verification supports a single query today; multi-query and
selective disclosure on chain are "soon". Keep `skipClaimRevocationCheck` out of every
production query.

## What every recipe cannot yet say

- Which issuer DIDs are accredited on mainnet. The docs give one testnet DID
  (`did:receptor:redbelly:testnet:31K82iKCtE6ciDc7oAr3T5EpjZb4S1EFM7c4xJaWkM2`); the mainnet
  registry contract exists but its ABI is not public (RESEARCH.md questions 15 and 29).
- Which `@iden3/contracts` release Redbelly's verifier backend targets, which decides whether
  the on-chain record is a sticky boolean (1.x `proofs`) or carries a block timestamp (2.x and
  3.x). Question 29. The adapter supports all three; the builder picks.
- Which on-chain circuit Redbelly's holders can prove: the SDK page says
  `credentialAtomicQuerySigV2OnChain`, the contract example says `credentialAtomicQueryMTPV2OnChain`.
- What happens on chain when a credential expires or is revoked after a proof was accepted.
  Nothing in the read pages says the record is cleared. Until proven otherwise, treat an
  accepted proof as permanent and put a freshness rule in the contract where the release allows it.
- Whether these queries have been run against a live Redbelly verifier by this project: they
  have not. Every recipe is a draft built from the documented shapes and the schema files, and
  stays a draft until a testnet run with the Eligibility SDK (which needs a GitHub Packages token
  and a verifier API key from Redbelly support) proves it.

## Sources

| What | Where | Checked |
|---|---|---|
| Query workflow, operators, circuits, on-chain single query only, revocation guidance, the seven queryable types, the worked examples (AML off-chain, ProofOfAddress on-chain, multi-query) | docs.redbelly.network/pages/eligibility-sdk/configure-eligibility-criteria/ | 2026-09-12 |
| Proof by Query flow: `ZKPVerifier` child, `setZKPRequest`, RHS revocation check, `submitZKPResponse`, the circuits | docs.redbelly.network/pages/methods/proof-by-query/ | 2026-09-12 |
| Contract example: `DriversLicenceCredential` with `birthDate $lt 20020101`, `credentialAtomicQueryMTPV2OnChain`, `allowedIssuers: ["*"]` with a production warning, `proofs[msg.sender][requestId]` | docs.redbelly.network/pages/methods/proof-by-query/contract-example/ | 2026-09-12 |
| Schema fields and types for every credential | github.com/redbellynetwork/receptor-schema, commit 3b37c11 (2 July 2026), `schemas/json/*.json` and `credentials/*.md` | 2026-09-12 |
| Accredited issuer registry addresses; issuers onboard users and businesses | vine.redbelly.network/identity/accredited-issuers/ | 2026-09-12 |
| Business verification, the `BusinessIdentifier` contract source with `AUTHORISED_REPRESENTATIVE_ROLE` and `AUTHORISED_DELEGATE_ROLE`, delegates get network write access | vine.redbelly.network/business-verification/verify-business/ and /identifier-contract/ | 2026-09-12 |
| Business onboarding SDK by Averer, API key from Averer support | docs.redbelly.network/pages/eligibility-sdk/onboarding/business/overview/ | 2026-09-12 |
| Iden3 release surfaces (1.x `proofs` bool, 2.x `isProofVerified` + `getProofStatus` with block timestamp, 3.x `isRequestProofVerified`) | RESEARCH.md receptor-mock rows, from the npm tarballs | 2026-09-12 |
