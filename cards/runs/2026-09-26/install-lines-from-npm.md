# Run record: every install line on the tools page, run against the public npm registry

Run on 26 September 2026 at 11:10 to 11:15 UTC on macOS, in an empty folder with `npm init -y`,
Node 24.20.0, `forge` 1.7.1, Slither 0.11.6 and Aderyn 0.6.8 on PATH. `npm view` gave 0.2.1 for all
nine packages.

| Line | What happened |
|---|---|
| `npm install @gatedpath/chains` | installed, 0 vulnerabilities, `^0.2.1` in package.json |
| `npm install @gatedpath/receptor-mock` | installed, 0 vulnerabilities |
| `npm install @gatedpath/contract-kit` | installed, 0 vulnerabilities |
| `npm install @gatedpath/frontend-kit` | installed, 0 vulnerabilities |
| `npx -y @gatedpath/agent-rules --out .` | wrote CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md, llms.txt, llms-full.txt; 1 s |
| `npx -y -p @gatedpath/preflight redbelly doctor` | eleven checks, all pass (the machine has Slither and Aderyn since the same morning); 3 s |
| `npx -y -p @gatedpath/ops-kit redbelly-alert --help` | printed its usage; 1 s |
| `npx -y @gatedpath/mcp` | answered `initialize` with `redbelly-mcp 0.2.1` and `tools/list` with fourteen tools over stdio; 2 s |
| `npm create redbelly-dapp@latest my-app -- --yes` | wrote the scaffold (contracts, web, recipes, vendor, the five rules files, README, SECURITY.md, THREAT-MODEL.md); under a second with a warm cache |

`node recipes/check.mjs` and `redbelly ship` are not install lines and were not run here; the first
runs in the repository, the second needs a keystore.
