# Credential from a named accredited issuer

The wallet holder holds a credential of one named type from one named accredited issuer,
and it satisfies one condition. Every Iden3 recipe pins its issuer; this one is about that
pin, with an AML/CTF check that passed as the worked condition.

## What accredited means

Vine's page: accredited issuers are the class that may grant network access, must meet
minimum onboarding requirements (photo ID with biometric verification for users, an
onboarded officeholder for businesses), are listed in an on-chain registry, and receive a
share of gas fees. The registry is at `0x2d68f1C50a057a310EeF28DF3199F95A65cE4ac5` on mainnet
and `0x6aEe06F4052ff6d01Ed7E13Fa5Ab53675756A057` on testnet. Its ABI is not public and
neither contract has verified source on Routescan, so the list cannot be read from here yet.

The docs print one issuer DID, for testnet:
`did:receptor:redbelly:testnet:31K82iKCtE6ciDc7oAr3T5EpjZb4S1EFM7c4xJaWkM2`. They don't say
which organisation it is. No mainnet DID is published. Averer is the only issuer Vine names,
for business verification; whether Averer issues AML/CTF credentials, and under which DID,
is not stated. All of that is `verify`.

This is not the same thing as `permission.isAllowed`. `isAllowed` says the wallet may
transact at all: an access credential from an accredited issuer, self-enabled on the
network's permission contract. A recipe says what an action requires on top of that. A
wallet can pass `isAllowed` and hold no AML/CTF credential.

## The query

The docs' own off-chain example is `amlCheckStatus $eq "passed"` on `AMLCTFCredential` with
request id 100 and the testnet DID; their on-chain example uses
`credentialAtomicQuerySigV2OnChain`. Put together:

```json
{
  "id": 100,
  "circuitId": "credentialAtomicQuerySigV2OnChain",
  "query": {
    "allowedIssuers": ["did:receptor:redbelly:testnet:31K82iKCtE6ciDc7oAr3T5EpjZb4S1EFM7c4xJaWkM2"],
    "context": "https://raw.githubusercontent.com/redbellynetwork/receptor-schema/refs/heads/main/schemas/json-ld/AMLCTFCredential.jsonld",
    "type": "AMLCTFCredential",
    "credentialSubject": { "amlCheckStatus": { "$eq": "passed" } }
  }
}
```

`allowedIssuers` holds exactly the DIDs you have decided to trust. The contract example
uses `["*"]` and says in the same line to use trusted DIDs in production; the wildcard
means any Iden3 identity that can sign a credential of this type gets through your gate.
The schema's five status fields are enums (`passed | failed`, `active | inactive`), so `$eq`
is exact. Requiring AML, PEP and sanctions all passed is three on-chain requests today, or
one off-chain multi-query; on-chain multi-query is "soon".

## How it reaches the chain

`setZKPRequest(100, request)` stores the query and its issuer list on your verifier. The
circuit checks the issuer's identity against that list, so a credential from any other
issuer cannot produce an accepted proof. After `submitZKPResponse(100, …)` the verifier
answers true for `(wallet, 100)` and `Gated(verifier, 100)` passes; otherwise
`NotEligible(wallet, 100)`. Changing the trusted set means a new `setZKPRequest`; proofs
accepted under the old list stay recorded, so if you drop an issuer because it went bad,
move to a new request id so old proofs stop counting.

## The five states

| State | On a real verifier | In tests |
|---|---|---|
| NeverIssued | No AML/CTF credential, or no proof for 100 | the mock's default |
| Valid | Pinned issuer, status passed, not revoked, proof accepted | `setStatus(wallet, 100, Valid)` |
| Expired | The credential envelope's expiration passed (`monitoringStatus: inactive` is a value, not an expiry); fresh proof fails if the circuit checks expiry (`verify`), an old accepted one stays | `setValidUntil` then `vm.warp` |
| Revoked | A check re-run and failed, credential revoked; non-revocation proof refused; an old accepted proof stays | `setStatus(wallet, 100, Revoked)` |
| WrongJurisdiction | A real credential from an issuer not in the list, or status failed: refused exactly like no credential | `setStatus(wallet, 100, WrongJurisdiction)` |

The last row is this recipe's point.

## Privacy

Leaves the wallet: the proof and its public inputs in a signed transaction. Lands on chain:
wallet, request 100, accepted; the request, so anyone can read that wallets passing your gate
hold an AML/CTF credential from issuer X with a passed status. A passed AML check is a
compliance fact about a person and is inferable from the gate; say so in your privacy notice.
Never on chain: the other four status fields, any identity field (the schema has none), the
issuer's internal results.

## Status

Draft, six `verify` markers, not run against a Redbelly verifier. Open questions 15, 17 and
29 in `RESEARCH.md`.
