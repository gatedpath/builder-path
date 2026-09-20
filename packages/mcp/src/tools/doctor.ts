// doctor: the machine before the first command, as redbelly-doctor reports it. In-process call
// into @gatedpath/preflight, so the words and the fix text are the failure table's. No network.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDoctorText, runDoctor } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const doctorInput = z.object({
  project: z.string().min(1).optional().describe('Absolute path of the project (a scaffold root or its contracts/ folder) for the .env and vendor/ checks; default: the server\'s working directory'),
}).strict();

export async function doctor(args: z.infer<typeof doctorInput>): Promise<CallToolResult> {
  const project = resolve(args.project ?? process.cwd());
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const report = await runDoctor({ project });
  const failing = report.checks.filter((c) => c.required && c.status === 'fail');
  return ok({
    ...report,
    text: renderDoctorText(report),
    next: report.ok
      ? { command: report.scaffold ? 'npm run dev' : 'create-redbelly-dapp my-app --yes', why: 'Every required check passed.' }
      : { command: failing[0]!.fix, why: `${failing[0]!.id} failed: ${failing[0]!.reason}`, kind: failing[0]!.kind },
  });
}
