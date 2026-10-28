#!/usr/bin/env node
// npm run deploy -- --from <anvil:index | keystore-name> [--reason "<why>"]
// Runs contracts/script/Deploy.s.sol only after scripts/policy.mjs says so, and a deploy always
// waits for a person to type the confirmation. The policy's chain decides the RPC; no --rpc-url
// flag, no --chain flag. The signer is an account name or an Anvil index; never a key.
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRpc } from '@gatedpath/chains';
import { decide, loadPolicy, parseArgs, personConfirms, printDecision, recordDecision, resolveSigner } from './policy.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args, cwd = root) => spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
try {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv, ['--from', '--reason']);
  const policy = loadPolicy(root);
  const rpc = createRpc(policy.rpc);
  const signer = await resolveSigner(args.from, policy, rpc, run);
  const request = { kind: 'deploy', reason: args.reason, argv, steering: args.steering, signer, from: args.from };
  const decision = await decide(request, policy, rpc);
  printDecision(decision, `policy for deploy: script/Deploy.s.sol from ${args.from} (chain ${policy.chain}, rules ${policy.path})`);
  let final = decision.verdict;
  if (final === 'waits') {
    const c = personConfirms(`deploy on chain ${policy.chain} from ${signer.address}`);
    decision.checks.push({ id: 'person-confirmed', status: c.ok ? 'pass' : 'fail', reason: c.reason });
    final = c.ok ? 'allowed' : 'refused';
  }
  const record = recordDecision(root, policy, request, decision, final);
  if (final !== 'allowed') {
    console.log(`\n${final === 'refused' ? 'refused' : 'not deployed'}: nothing was signed. Recorded in ${record}`);
    process.exit(1);
  }
  const forge = run('forge', ['script', 'script/Deploy.s.sol', '--rpc-url', policy.rpc, '--broadcast', ...signer.forgeArgs], join(root, 'contracts'));
  process.stdout.write(forge.stdout); process.stderr.write(forge.stderr);
  console.log(`${forge.status === 0 ? 'deployed' : 'forge script failed'}. Recorded in ${record}`);
  process.exit(forge.status === 0 ? 0 : 1);
} catch (e) {
  console.error(`deploy: ${e.message}`);
  // A request refused before the rules ran (a key offered as the signer, an unknown flag) is recorded too, with its reason and never its value.
  try { recordDecision(root, loadPolicy(root), { kind: 'deploy', argv: [], steering: [], signer: {}, from: '(not read)' }, { checks: [{ id: 'request', status: 'fail', reason: e.message }] }, 'refused'); } catch { /* no policy file to record against */ }
  process.exit(2);
}
