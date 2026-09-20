# AU wholesale investor

A qualified accountant has certified the wallet holder as a sophisticated or wholesale
investor, and a Redbelly accredited issuer has turned that certificate into a credential.
The dApp learns that the credential exists, from an issuer it trusts. It learns nothing
about the accountant and nothing about the holder.

## What the holder has

An `AUSophisticatedWholesaleInvestorCredential`. The schema has three fields, all required:
`accountantCertification` (which professional body the accountant belongs to; the
vocabulary gives CPA, CA and IPA as examples, not as an enumeration),
`accountantMembershipNumber` and `accountantEmail`. That is all. There is no boolean saying
"wholesale", no threshold, no certificate date, and no reference to which Corporations Act
test the issuer applied. The schema is the accountant's certificate, not the legal
conclusion. If your offer document names s708(8), s708(10) or s761G, ask the issuer in
writing which test their credential attests to; the docs don't say, and neither does this
recipe.

Which accredited issuer issues this type, and on which network, is not published either.
Averer is named for business verification, not for this credential.

## The query

Proof of issuance: prove the credential exists from an allowed issuer without revealing a
field. The docs list "Proof of Issuance" as a query type but print no example of its shape.
`$exists` is in the documented operator list, and applied to a required field it says
"this credential exists" without disclosing the value, so that is the shape here, marked
`verify` until the SDK confirms it:

```json
{
  "id": 708,
  "circuitId": "credentialAtomicQuerySigV2OnChain",
  "query": {
    "allowedIssuers": ["did:receptor:redbelly:testnet:31K82iKCtE6ciDc7oAr3T5EpjZb4S1EFM7c4xJaWkM2"],
    "context": "https://raw.githubusercontent.com/redbellynetwork/receptor-schema/refs/heads/main/schemas/json-ld/AUSophisticatedWholesaleInvestorCredential.jsonld",
    "type": "AUSophisticatedWholesaleInvestorCredential",
    "credentialSubject": { "accountantMembershipNumber": { "$exists": true } }
  }
}
```

The alternative, `accountantCertification $in ["CPA", "CA", "IPA"]`, rests on example
values and would exclude a valid certificate from any other body. The docs' multi-query
example discloses `accountantEmail` off chain; that reveals a person's email and proves
nothing more than `$exists` does, so don't reuse it for eligibility.

## How it reaches the chain

As every Iden3 recipe: `setZKPRequest(708, request)` on your `ZKPVerifier` child, the holder
calls `submitZKPResponse(708, …)`, the verifier answers true for `(wallet, 708)`, and
`Gated(verifier, 708)` reads it through `Iden3VerifierAdapter` and reverts
`NotEligible(wallet, 708)` otherwise. 708 is a mnemonic for the Act's section; any uint64
works. An accepted proof stays on the contract after the certificate lapses or the credential
is revoked unless your contract enforces a freshness window (2.x, 3.x) or moves to a new
request id (1.x).

## The five states

| State | On a real verifier | In tests |
|---|---|---|
| NeverIssued | No credential of this type, or no proof for 708 | the mock's default |
| Valid | Allowed issuer, not revoked, proof accepted | `setStatus(wallet, 708, Valid)` |
| Expired | The schema has no validity field; expiry is whatever the issuer put on the credential envelope (`verify`); a fresh proof fails, an old accepted one stays | `setValidUntil` then `vm.warp` |
| Revoked | Certificate withdrawn, credential revoked, non-revocation proof refused; an old accepted proof stays | `setStatus(wallet, 708, Revoked)` |
| WrongJurisdiction | Wrong type or an issuer not in `allowedIssuers` | `setStatus(wallet, 708, WrongJurisdiction)` |

## Privacy

Leaves the wallet: the proof and its public inputs, in a signed transaction. Lands on chain:
wallet, request 708, accepted; and the request itself, which tells any observer that this
dApp admits certified wholesale investors, so every wallet that passes is publicly a
certified wholesale investor. That is financial information about a person. Decide whether
your users accept it before you ship. Never on chain: the accountant's name, body, number or
email, and no identity field, because the credential carries none.

## Status

Draft, seven `verify` markers, not run against a Redbelly verifier. Open questions 15, 17
and 29 in `RESEARCH.md`.
