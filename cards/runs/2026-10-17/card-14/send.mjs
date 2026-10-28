#!/usr/bin/env node
// npm run send -- --to <address> --amount <RBNT> --from <anvil:index | keystore-name> [--reason "<why>"]
// Sends RBNT only after scripts/policy.mjs says so. Every decision, allowed or refused, lands in
// deployments/policy-<chain>-<date>.md. The signer is an Anvil account index on the local fork or a
// Foundry keystore name on 153; never a key. Exit 0 sent, 1 refused or waiting, 2 usage.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRpc } from '@gatedpath/chains';
import { decide, loadPolicy, parseArgs, parseRbnt, personConfirms, printDecision, recordDecision, resolveSigner } from './policy.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
try {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv, ['--to', '--amount', '--from', '--reason']);
  const policy = loadPolicy(root);
  const rpc = createRpc(policy.rpc);
  const amountWei = parseRbnt(args.amount ?? '');
  const signer = await resolveSigner(args.from, policy, rpc, run);
  const request = { kind: 'send', to: args.to, amountWei, reason: args.reason, argv, steering: args.steering, signer, from: args.from };
  const decision = await decide(request, policy, rpc);
  printDecision(decision, `policy for send: ${args.amount} RBNT to ${args.to} from ${args.from} (chain ${policy.chain}, rules ${policy.path})`);
  let final = decision.verdict;
  if (final === 'waits') {
    const c = personConfirms(`send ${args.amount} RBNT to ${args.to}`);
    decision.checks.push({ id: 'person-confirmed', status: c.ok ? 'pass' : 'fail', reason: c.reason });
    final = c.ok ? 'allowed' : 'refused';
  }
  const record = recordDecision(root, policy, request, decision, final);
  if (final !== 'allowed') {
    console.log(`\n${final === 'refused' ? 'refused' : 'not sent'}: nothing was signed. Recorded in ${record}`);
    process.exit(1);
  }
  const cast = run('cast', ['send', args.to, '--value', amountWei.toString(), '--rpc-url', policy.rpc, '--json', ...signer.castArgs]);
  process.stderr.write(cast.stderr);
  let receipt = null; try { receipt = JSON.parse(cast.stdout); } catch { process.stdout.write(cast.stdout); }
  console.log(`${cast.status === 0 && receipt ? `sent: transaction ${receipt.transactionHash} in block ${Number(receipt.blockNumber)}, status ${receipt.status}, ${Number(receipt.gasUsed)} gas` : 'cast send failed'}. Recorded in ${record}`);
  process.exit(cast.status === 0 ? 0 : 1);
} catch (e) {
  console.error(`send: ${e.message}`);
  // A request refused before the rules ran (a key offered as the signer, an unknown flag) is recorded too, with its reason and never its value.
  try { recordDecision(root, loadPolicy(root), { kind: 'send', argv: [], steering: [], signer: {}, from: '(not read)' }, { checks: [{ id: 'request', status: 'fail', reason: e.message }] }, 'refused'); } catch { /* no policy file to record against */ }
  process.exit(2);
}
