// Builds the MCP server. Every tool has a strict input schema and passes through refuseKeys
// before its handler runs. Stdio only; nothing here opens a port.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import type { ZodObject, ZodRawShape, output } from 'zod';
import { refuseKeys } from './guard.js';
import { chainInfo, chainInfoInput, docsLookup, docsLookupInput, gasEstimateInput, gasEstimateUsd, isVerified, isVerifiedInput } from './tools/read-only.js';
import { fiveStateInput, fiveStateTests, preflight, preflightInput, rulesCheckInput, rulesFilesCheck } from './tools/project.js';
import { deployTestnet, deployTestnetInput, verifyRoutescan, verifyRoutescanInput } from './tools/signing.js';
import { status, statusInput } from './tools/status.js';
import { explainFailure, explainFailureInput } from './tools/explain.js';
import { doctor, doctorInput } from './tools/doctor.js';
import { gasReport, gasReportInput } from './tools/gas.js';
import { shipReport, shipReportInput } from './tools/ship.js';

const require = createRequire(import.meta.url);
export const VERSION: string = (require('../package.json') as { version: string }).version;

export const TOOL_NAMES = ['chain_info', 'is_verified', 'gas_estimate_usd', 'preflight', 'five_state_tests', 'rules_files_check', 'deploy_testnet', 'verify_routescan', 'docs_lookup', 'status', 'explain_failure', 'doctor', 'gas_report', 'ship_report'] as const;

/**
 * What a tool does, for the client's approval prompt. `reads`: looks at files and public RPCs, runs
 * nothing of the project's. `runs-project-code`: runs forge in the project, which compiles and
 * executes the project's own tests, so it is NOT read-only even though it changes nothing of the
 * user's. `signs`: may broadcast or submit.
 */
type ToolKind = 'reads' | 'runs-project-code' | 'signs';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'redbelly-mcp', version: VERSION }, { instructions: INSTRUCTIONS });

  const register = <S extends ZodObject<ZodRawShape>>(name: (typeof TOOL_NAMES)[number], description: string, schema: S, kind: ToolKind, handler: (args: output<S>) => CallToolResult | Promise<CallToolResult>, allowHashAt: readonly string[] = []) => {
    const guarded: ToolCallback<S> = (async (args: unknown) => {
      const refused = refuseKeys(args, { allowHashAt });
      if (refused) return refused;
      return handler(args as output<S>);
    }) as unknown as ToolCallback<S>;
    server.registerTool(
      name,
      { description, inputSchema: schema, annotations: { readOnlyHint: kind === 'reads', destructiveHint: kind === 'signs', openWorldHint: true } },
      guarded,
    );
  };

  register('chain_info', 'Chain object, verified contract addresses (with the date each was checked on that chain and its source) and the known allowed test address for Redbelly mainnet (151) or testnet (153). No network call.', chainInfoInput, 'reads', chainInfo);
  register('is_verified', 'Whether a wallet passes permission.isAllowed on the chain, which is the gate every transaction on Redbelly goes through. False means the person has not verified at access.redbelly.network. Read-only eth_call.', isVerifiedInput, 'reads', isVerified);
  register('gas_estimate_usd', 'Price a gas amount in RBNT and US dollars from the latest base fee and the on-chain price feed. Read-only.', gasEstimateInput, 'reads', gasEstimateUsd);
  register('preflight', 'Run redbelly-preflight on a project and return its JSON report: chain id match, deployer isAllowed, Safe admin with threshold, compiler pins, secrets in git history, RBNT balance with margin, Slither report freshness. Read-only; the deployer comes from a keystore name or a public address, never a key.', preflightInput, 'reads', preflight);
  register('five_state_tests', 'Run the Foundry test contracts that inherit GatedTest (forge test --match-contract) and report pass/fail per test. Every gated function must be proven against all five credential states.', fiveStateInput, 'runs-project-code', fiveStateTests);
  register('rules_files_check', 'Check that CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md, llms.txt and llms-full.txt in the project match the agent-rules render (redbelly-agent-rules --check). Writes nothing.', rulesCheckInput, 'reads', rulesFilesCheck);
  register('deploy_testnet', 'Deploy to Redbelly testnet with forge script --account <keystore-name> --broadcast. Refuses any RPC that reports chain 151. Refuses when pre-flight fails. The key stays in the Foundry keystore; forge signs locally.', deployTestnetInput, 'signs', deployTestnet);
  register('verify_routescan', 'Build and run the Routescan verification recipe (forge verify-contract with Routescan\'s Etherscan-style API). Default dryRun=true prints the standard JSON input and makes no network call; dryRun=false submits and watches.', verifyRoutescanInput, 'signs', verifyRoutescan);
  register('status', 'Where the project is on the path and the one next command: compiles, tests passed and failed, the five-state suites, Slither present and fresh, rules files match or drifted, deployments (local.json from npm run dev, and records or broadcasts for 153 and 151), and next = the first step not done in the order compile, tests, five-state tests, Slither, rules files, pre-flight, testnet deploy, verify, ship report. No network call unless rpc is given; with it, pre-flight runs read-only and Routescan is asked about a testnet deployment. Never signs.', statusInput, 'runs-project-code', status);
  register('explain_failure', 'Plain words for one failure, from the shared table in @gatedpath/agent-rules: pass a revert (hex data or the message), a txHash with chain (the receipt is read and a failed transaction replayed with eth_call to recover the revert; a NotEligible revert is followed by a read of the verifier\'s eligibilityStatus, which names the credential state on ReceptorMock), or a pasted stderr from forge, cast, anvil, npm run dev or redbelly-preflight. Returns kind, plainWords, cause and fix (command and/or link); kind "unknown" with the raw text when nothing matches, never a guess. With rpc, gas figures are priced through the feed. Read-only; never signs.', explainFailureInput, 'reads', explainFailure, ['$.txHash']);
  register('doctor', 'The machine before the first command, as redbelly-doctor reports it: Node 22 or later; forge, anvil and cast present, one version, and the real binaries rather than the @foundry-rs npm shim that exits 0 whatever the binary returned (detected by probing); slither and aderyn optional; git; no .env tracked; in a scaffold, vendor/ matching the versions the scaffolder recorded. One entry per check with pass, warn or fail and the fix from the shared failure table; ok is true only when every required check passes. No network call.', doctorInput, 'reads', doctor);
  register('gas_report', 'Gas per test or per function in RBNT and US cents (redbelly gas): reads the project\'s .gas-snapshot, or runs forge test --gas-report --json, and prices every row at the latest base fee and the on-chain feed price on the chain (default 153; rpc may be a fork). diff compares against a previous snapshot or report. Returns the quote (block, base fee, USD per RBNT, feed timestamp), rows with gas, wei, rbnt, usd and cents, the deployment rows on their own, and the text table. Read-only: two RPC reads and forge on the local machine; never signs.', gasReportInput, 'runs-project-code', gasReport);
  register('ship_report', 'The mainnet gate that writes its own report (redbelly ship): runs pre-flight with the keystore\'s address, checks the Slither sidecar, runs forge test and the five-state suites, prices the gas report at the chain\'s base fee and feed price, reads the deployer and the admin (isAllowed, Safe 1.4.1, threshold, owners), and writes deployments/ship-<chain>-<date>.md with every check, the addresses, the constructor arguments and the verify command. Refuses to write when any check fails. The deploy script refuses to broadcast on 151 without a report dated today; 153 warns. Writes one file; never signs.', shipReportInput, 'runs-project-code', shipReport);
  register('docs_lookup', 'The URL on Vine or docs.redbelly.network for a topic, plus the one-line consequence for your code from the agent rules. Links only; never fetches or rewrites Redbelly\'s pages.', docsLookupInput, 'reads', docsLookup);

  return server;
}

const INSTRUCTIONS = `Redbelly Network builder tools (chain 151 mainnet, 153 testnet). Rules: this server never takes a private key, seed phrase or keystore; tools that sign take a Foundry keystore name and forge signs locally; an argument that looks like a key is refused. Testnet is fast (deploy_testnet); mainnet is gated by preflight and a ship report and is never deployed from here. Vine (vine.redbelly.network) and docs.redbelly.network are the reference; docs_lookup links to them. There is no faucet tool yet; docs_lookup("faucet") gives the URL. Call status with the project path before a turn to get the one next command; call explain_failure with a revert, a txHash or a pasted stderr to get plain words, the cause and the fix. Call doctor first on a new machine; gas_report for RBNT and US cents per function; ship_report to write the document the mainnet deploy needs (it refuses when any check fails).`;
