# Over 18

The wallet holder was born at least eighteen years before today. The dApp learns that and
nothing else: not the date of birth, not the document, not the name.

## What the holder has

A government identity credential from a Redbelly accredited issuer. Four types in the
`receptor-schema` repository carry a `birthDate` field, an integer in YYYYMMDD form:
`PassportCredential`, `DriversLicenceCredential`, `EssentialIdCredential` and
`NationalIdCredential`. All four are on the SDK's list of queryable types. Each also carries
an `expiryDate` in the same form.

## The query

Redbelly's own contract example checks `birthDate $lt 20020101` on a driver's licence, so
the shape is documented. For "over 18" the number is today minus eighteen years, plus one
day so that someone whose eighteenth birthday is today passes. On 12 September 2026 that is
`birthDate $lt 20080913`:

```json
{
  "id": 18,
  "circuitId": "credentialAtomicQuerySigV2OnChain",
  "query": {
    "allowedIssuers": ["did:receptor:redbelly:testnet:31K82iKCtE6ciDc7oAr3T5EpjZb4S1EFM7c4xJaWkM2"],
    "context": "https://raw.githubusercontent.com/redbellynetwork/receptor-schema/refs/heads/main/schemas/json-ld/PassportCredential.jsonld",
    "type": "PassportCredential",
    "credentialSubject": { "birthDate": { "$lt": 20080913 } }
  }
}
```

Two things the docs don't pin. The SDK page's on-chain example uses
`credentialAtomicQuerySigV2OnChain`; the contract example uses
`credentialAtomicQueryMTPV2OnChain`. Which one holders on 153 and 151 can actually prove is a
`verify`. And the only issuer DID printed anywhere is the testnet one above; mainnet issuer
DIDs are not published and the registry's ABI is not public, so `allowedIssuers` for mainnet
is a `verify` too. `["*"]` accepts any issuer and is for demos, as the docs say.

On-chain verification takes one query per request. To accept a passport or a licence or a
national ID, set one request per type (18, 19, 20, 21) and gate on any of them; `Gated`
binds one id, so that is a small OR in your contract or an adapter that checks several ids.

## How it reaches the chain

Your contract inherits Iden3's `ZKPVerifier`. You call `setZKPRequest(18, request)`. The
holder's wallet checks revocation against the reverse hash service, generates the proof and
calls `submitZKPResponse(18, …)`. From then on the verifier answers true for `(wallet, 18)`:
`proofs[wallet][18]` on 1.x, `isProofVerified(wallet, 18)` on 2.x,
`isRequestProofVerified(wallet, 18)` on 3.x. `Gated(verifier, 18)` reads that through
`Iden3VerifierAdapter` as `isEligible(msg.sender, 18)` and reverts `NotEligible(wallet, 18)`
on false. The request id in the query and the one `Gated` holds are the same number.

Two consequences follow from the request being static. The cutoff is fixed when
`setZKPRequest` runs, so a person born on 13 September 2008 turns eighteen the day after
this example and is still refused until the request is re-set; either re-set it on a
schedule from a keeper the owner controls, or accept the lag and say so. And an accepted
proof is a record on your contract that nothing in the read documentation clears when the
credential later expires or is revoked. With a 2.x or 3.x verifier, read the proof's block
timestamp and require it to be inside a freshness window; on 1.x the record is a bare boolean
and a new request id is the only remedy.

## The five states

| State | On a real verifier | In tests |
|---|---|---|
| NeverIssued | No credential, or no proof submitted for request 18: no record, `NotEligible(wallet, 18)` | the mock's default |
| Valid | Allowed issuer, born before the cutoff, not revoked, proof accepted: passes | `setStatus(wallet, 18, Valid)` |
| Expired | The credential's `expiryDate` has passed; a fresh proof fails if the circuit checks expiry (`verify`); an old accepted proof stays | `setValidUntil` then `vm.warp` |
| Revoked | The reverse hash service refuses a non-revocation proof; an old accepted proof stays | `setStatus(wallet, 18, Revoked)` |
| WrongJurisdiction | Born after the cutoff, or issuer not allowed: no proof can exist, indistinguishable from NeverIssued on chain | `setStatus(wallet, 18, WrongJurisdiction)` |

`assertRevertsForAllInvalidStates(target, callData, wallet, 18)` from `GatedTest` covers all
five in one call. The mock can express Expired and Revoked directly, which a real verifier
cannot; that is the point of testing against the mock.

## Privacy

Leaves the wallet: the proof and its public inputs (the holder's Iden3 identity, the
issuer, the schema, the query hash; the exact public signals for the on-chain circuits are a
`verify`), inside a transaction the wallet signs. Lands on chain: wallet address, request 18,
accepted, on your contract; the request itself, so anyone can read that you check age
eighteen against passports from issuer X; on 2.x and 3.x, the block and timestamp of the
proof. Never on chain: the date of birth, the name, the document number, the nationality,
the expiry date, or whether the holder is eighteen or eighty.

Keep the frontend and backend the same way. The SDK returns a proof, not attributes.

## Status

Draft. Built from the documented query shape and the schema files on 12 September 2026; not
yet run against a Redbelly verifier, which needs the Eligibility SDK (GitHub Packages token
and a verifier API key from Redbelly support) and a testnet deployment. Six `verify` markers
in `recipe.json`; open questions 15, 17 and 29 in `RESEARCH.md`.
