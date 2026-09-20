// The alert poller against a fake RPC: the two ways it went permanently silent (audit of 2026-09-19).
// No chain, no forge; alert.test.mjs covers the real contract on anvil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollOnce } from '../scripts/alert.mjs';
import { topicsByName } from '../src/events.mjs';

const token = '0x00000000000000000000000000000000000000aa';
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const addrTopic = (a) => '0x' + a.slice(2).padStart(64, '0');
const log = (name, block, { topics = [], data = '0x' } = {}) => ({
  address: token, topics: [topicsByName[name], ...topics], data,
  blockNumber: '0x' + block.toString(16), transactionHash: '0x' + word(block), logIndex: '0x0',
});

/** An RPC that, like the governors endpoint, refuses a range of more than 100 blocks. */
function fakeRpc(head, logs, ranges) {
  return async (method, params) => {
    if (method === 'eth_blockNumber') return '0x' + head.toString(16);
    if (method === 'eth_getLogs') {
      const from = Number(BigInt(params[0].fromBlock));
      const to = Number(BigInt(params[0].toBlock));
      ranges.push(to - from + 1);
      if (to - from + 1 > 100) throw new Error('block range too large');
      return logs.filter((l) => Number(BigInt(l.blockNumber)) >= from && Number(BigInt(l.blockNumber)) <= to);
    }
    throw new Error(`unexpected ${method}`);
  };
}

test('a gap longer than the RPC allows is read in windows, and the event inside it still alerts', async () => {
  const ranges = [];
  const rpc = fakeRpc(5000, [log('Paused', 4850, { data: '0x' + word(1) })], ranges);
  const state = { lastBlock: 4700 };
  const got = [];
  const r = await pollOnce({ rpc, contract: token, network: 'mainnet', state, minSeverity: 'info', deliver: async (a) => got.push(a.event), log: () => {} });
  assert.deepEqual(got, ['Paused']);
  assert.equal(state.lastBlock, 5000, 'the poller caught up');
  assert.ok(ranges.every((n) => n <= 100), `asked for ${Math.max(...ranges)} blocks at once`);
  assert.equal(r.head, 5000);
});

test('a permission that never expires does not stop the alerts beside it', async () => {
  const never = (1n << 64n) - 1n;
  const issuer = '0x00000000000000000000000000000000000000bb';
  const logs = [
    log('IssuerPermissionSet', 101, { topics: [addrTopic(issuer)], data: '0x' + word(0) + word(never) + word(1000) }),
    log('Paused', 101, { data: '0x' + word(1) }),
  ];
  const state = { lastBlock: 100 };
  const got = [];
  await pollOnce({ rpc: fakeRpc(101, logs, []), contract: token, network: 'mainnet', state, minSeverity: 'info', deliver: async (a) => got.push(a), log: () => {} });
  assert.deepEqual(got.map((a) => a.event), ['IssuerPermissionSet', 'Paused']);
  assert.match(String(got[0].args.validUntil), /18446744073709551615|never/);
  assert.equal(state.lastBlock, 101);
});

test('a log that cannot be decoded is reported, not swallowed, and does not take the batch with it', async () => {
  const logs = [log('IssuerPermissionSet', 101, { topics: [], data: '0x' }), log('Paused', 101, { data: '0x' + word(1) })];
  const got = [];
  await pollOnce({ rpc: fakeRpc(101, logs, []), contract: token, network: 'mainnet', state: { lastBlock: 100 }, minSeverity: 'critical', deliver: async (a) => got.push(a), log: () => {} });
  assert.deepEqual(got.map((a) => a.event), ['DecodeFailed', 'Paused']);
  assert.equal(got[0].severity, 'critical', 'an event the operator cannot read is one they must look at');
});
