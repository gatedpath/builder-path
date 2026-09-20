# Eligibility SDK (optional)

The Redbelly Eligibility SDK (`@redbellynetwork/eligibility-sdk`) lets the front end ask the
holder's identity wallet for a credential proof and check it against your verifier. This app
builds and runs without it: the network gate (`permission.isAllowed`) and the contract's
`gated` modifier already enforce eligibility on-chain. Add the SDK when you want the UI to
tell a user *why* they are ineligible before they sign, or to run the Proof by Query flow.

Two things are needed that no script can fetch for you:

1. A GitHub token with `read:packages`, because the SDK is on GitHub Packages, not npm.
2. A verifier API key from Redbelly support.

Steps, in order:

1. Create `web/.npmrc` with the scope pointed at GitHub Packages. The token comes from an
   environment variable, never from the file:

   ```
   @redbellynetwork:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

2. Export `NODE_AUTH_TOKEN` in the shell that runs the install (a fine-grained token with
   `read:packages`), then `__PM_INSTALL__ @redbellynetwork/eligibility-sdk` in `web/`.
3. Ask Redbelly support for a verifier API key and keep it server-side only. It is not a
   `NEXT_PUBLIC_` value. Read it in a route handler, never in a client component.
4. Rename `EligibilityGate.tsx.example` to `EligibilityGate.tsx`, fill in the query for your
   credential schema (the seven queryable schemas are listed on
   https://docs.redbelly.network/pages/eligibility-sdk/configure-eligibility-criteria/), and
   render it above `GatedAction` in `src/app/page.tsx`.
5. Keep revocation checks on in production.

Reference: https://docs.redbelly.network/pages/eligibility-sdk/getting-started/

If any of these is missing, stop and get it. Don't stub the SDK to get past it; the on-chain
gate still holds, and a stub would make the UI lie about eligibility.
