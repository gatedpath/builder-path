// gas_report: `redbelly gas` as a tool. Prices a project's .gas-snapshot, or forge's gas report, at
// the chain's base fee and feed price and returns RBNT and US cents per row, with an optional diff.
// Read-only: two RPC reads plus, when there is no snapshot, forge test on the local machine.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderGasText, runGas } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { forgeRefusal } from '../forge-guard.js';
import { rpcFor } from '../rpc.js';
import { projectSchema } from './project.js';
import { chainSchema, rpcSchema } from './read-only.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const gasReportInput = z.object({
  project: projectSchema.describe('Absolute path of the Foundry project or scaffold root (its contracts/ is used)'),
  chain: chainSchema.optional().describe('Chain to price on; default 153'),
  rpc: rpcSchema,
  snapshot: z.string().max(500).optional().describe('A .gas-snapshot or gas-report JSON file to price instead of the project\'s own'),
  report: z.boolean().optional().describe('Run forge test --gas-report --json even when .gas-snapshot exists'),
  diff: z.string().max(500).optional().describe('A previous .gas-snapshot or gas-report JSON to compare against'),
}).strict();

export async function gasReport(args: z.infer<typeof gasReportInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const refusal = forgeRefusal(project);
  if (refusal) return fail(refusal, { project: project });
  const chain = args.chain ?? 153;
  const rpc = rpcFor(chain, args.rpc);
  try {
    const report = await runGas({ project, chain, rpc, ...(args.snapshot ? { snapshot: args.snapshot } : {}), ...(args.report ? { report: true } : {}), ...(args.diff ? { diff: args.diff } : {}) });
    const plain = JSON.parse(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Record<string, unknown>;
    const deployments = report.rows.filter((r) => r.item === 'deployment').map((r) => ({ contract: r.contract, gas: r.gas.toString(), rbnt: r.rbnt, usd: r.usd, cents: r.cents }));
    return ok({
      ...plain,
      text: renderGasText(report),
      deployments,
      note: 'Gas is priced in US dollars and converted to RBNT at execution from the on-chain feed, so cents is the stable column. Base fee only. Pass a deployment gas figure to preflight --gas for the balance check, which adds 25%.',
    });
  } catch (e) {
    return fail(`gas report could not run: ${(e as Error).message}`, { project, chain, rpc });
  }
}
