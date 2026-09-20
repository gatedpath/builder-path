// ship_report: `redbelly ship` as a tool. Runs pre-flight with the keystore's address, checks the
// Slither sidecar, runs the tests and the five-state suites, prices the gas report, reads the
// deployer and the admin, and writes deployments/ship-<chain>-<date>.md when every check passed.
// The one tool here that writes a file; it never signs (the account name resolves to an address
// through cast and nothing else is read from the keystore).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderShipText, runShip } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { forgeRefusal } from '../forge-guard.js';
import { rpcFor } from '../rpc.js';
import { accountSchema, passwordFileSchema, projectSchema } from './project.js';
import { addressSchema, chainSchema, rpcSchema } from './read-only.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const shipReportInput = z.object({
  project: projectSchema.describe('Absolute path of the Foundry project or scaffold root (its contracts/ is used)'),
  chain: chainSchema,
  account: accountSchema.unwrap().describe('Foundry keystore name; cast resolves the deployer address, forge never runs'),
  passwordFile: passwordFileSchema,
  admin: addressSchema.optional().describe('The Safe that receives every role (or ADMIN_SAFE in .env); required on 151'),
  verifier: addressSchema.optional().describe('The dApp\'s verifier (or VERIFIER in .env); required on 151'),
  gas: z.number().int().positive().optional().describe('Deployment gas for the balance check; default the gas report\'s deployment row'),
  rpc: rpcSchema,
}).strict();

export async function shipReport(args: z.infer<typeof shipReportInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const refusal = forgeRefusal(project);
  if (refusal) return fail(refusal, { project });
  const rpc = rpcFor(args.chain, args.rpc);
  try {
    const report = await runShip({ project, chain: args.chain, account: args.account, rpc, ...(args.passwordFile ? { passwordFile: args.passwordFile } : {}), ...(args.admin ? { admin: args.admin } : {}), ...(args.verifier ? { verifier: args.verifier } : {}), ...(args.gas ? { gas: args.gas } : {}) });
    const plain = JSON.parse(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Record<string, unknown>;
    const failing = report.checks.filter((c) => c.status === 'fail');
    const result = {
      ...plain,
      text: renderShipText(report),
      next: report.ok
        ? { command: `forge script script/Deploy.s.sol --rpc-url ${report.network === 'mainnet' ? 'redbelly_mainnet' : 'redbelly_testnet'} --account ${args.account} --broadcast`, why: `Every check passed and ${report.written} is written; the deploy script accepts a broadcast on ${report.chain} today. This step signs with the keystore, and it is yours to run.` }
        : { command: null, why: `${failing.length} check${failing.length === 1 ? '' : 's'} failed (${failing.map((c) => c.id).join(', ')}); nothing was written. Fix each, then call ship_report again.` },
    };
    return report.ok ? ok(result) : fail(`ship report refused: ${failing.map((c) => `${c.id}: ${c.reason}`).join(' | ')}`, result);
  } catch (e) {
    return fail(`ship could not run: ${(e as Error).message}`, { project, chain: args.chain, rpc });
  }
}
