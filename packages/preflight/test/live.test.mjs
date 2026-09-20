// Read-only against the real testnet RPC. Needs an environment that can reach
// governors.testnet.redbelly.network. Nothing signs, nothing is sent.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { knownAllowed } from '@gatedpath/chains';
import { runPreflight, renderText } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const rpc = process.env.RBN_TESTNET_RPC ?? 'https://governors.testnet.redbelly.network';

test('testnet: read-only pre-flight of receptor-mock with the known allowed address', async () => {
  const r = await runPreflight({ project: join(here, '..', '..', 'receptor-mock'), chain: 153, rpc, address: knownAllowed.testnet.address, admin: knownAllowed.testnet.address, gas: 1_000_000 });
  console.log(renderText(r));
  const byId = (id) => r.checks.find((c) => c.id === id);
  assert.equal(r.chain.reported, 153);
  assert.equal(byId('chain-id').status, 'pass');
  assert.equal(byId('deployer-verified').status, 'pass');
  assert.equal(byId('admin-safe').status, 'warn', 'the known allowed address is an EOA');
  assert.equal(byId('compiler-pins').status, 'pass');
  assert.equal(byId('git-secrets').status, 'pass');
  assert.ok(['pass', 'fail'].includes(byId('balance').status));
  assert.ok(byId('balance').data.usdPerRbnt > 0);
  assert.equal(byId('slither-report').status, 'pass');
});
