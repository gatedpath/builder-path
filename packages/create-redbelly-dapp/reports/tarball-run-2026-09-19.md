# The nine 0.2.0 tarballs, installed in an empty folder and run: 19 September 2026

The test that was not done before 0.1.0, which is why the scaffolder 0.1.0 shipped broken. Every
package was packed exactly as `scripts/publish/first-publish.sh` packs it (`prepare.mjs` rewrites the
`file:` links to versions, `prepack` builds), all nine tarballs were installed together with
`npm install *.tgz` in an empty folder, and the installed commands were run as a stranger would.
Nothing was published; no key, token or real network was involved. Node v24.20.0, Foundry 1.7.1,
the owner's Mac. 26 s for everything below after the install.

| Step | Result |
|---|---|
| `create-redbelly-dapp my-app --yes` from `node_modules/.bin` | project written; `package.json` says scaffolder `0.2.0` |
| `npm run doctor` on the bare scaffold, before any install | `ok: every required check passed (2 warnings, optional)`. On 0.1.1 this crashed with `ERR_MODULE_NOT_FOUND @gatedpath/agent-rules` |
| `npm install`, `npm run contracts:install`, `npm run test` | `68 tests passed, 0 failed` in 7 suites (0.1.1: 63) |
| `npm run preflight -- --offline`, before `git init` | the two git checks FAIL and say the folder is not a repository; the key-shape scan reads 83 files and passes; it no longer passes with nothing read |
| the same, after the first commit | `5 of 6 checks passed`; the one failure is `DEPLOYER is a public address`, unset on purpose |
| `npm run web:build` | `Compiled successfully` (the wrong-network guard type-checks) |
| `npm run rules:check` | every rules file matches; none contains `npx redbelly-`; `CLAUDE.md` prints `npx -y @gatedpath/agent-rules` |
| `redbelly-alert --help`, `redbelly-preflight --version` | usage text; `0.2.0` |
| `redbelly-mcp` over stdio: `initialize`, `tools/list` | `redbelly-mcp 0.2.0`, 14 tools, `status` annotated `readOnlyHint: false` |
| `require('@gatedpath/chains/package.json')`, and frontend-kit's | `0.2.0`, `0.2.0`: the exports map lists `./package.json` |

The recorded project files re-run on that scaffold, for the totals the site's pages state: project 1
(`WholesaleGate.t.sol`) 72; project 2, Solidity track (`PauseProof.t.sol`) 71; project 2, agent track
(`PauseRoles.t.sol` and the invariants diff) 74; project 5 (the bond's four files) 85. The contract kit
itself: 53, of which 12 invariants. The 17 September `change.diff` for project 1 no longer applies to
`.env.example`, which fix 1 rewrote on 18 September; the page's instructions are in words, not that diff.

Package suites the same day at 0.2.0: chains 13, agent-rules 23, preflight 57, frontend-kit 95, mcp 33,
ops-kit 29, scaffolder 14 (integration) and 12 (unit), receptor-mock 34 with 1 skipped, contract-kit 53.
