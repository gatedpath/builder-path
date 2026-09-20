// Answers open questions 1 and 2: which EVM hardfork the network executes, and which
// precompiles exist. Read-only. Uses eth_call with no `to` so the node executes the
// given bytes as contract-creation init code; an unsupported opcode surfaces as an
// error, a supported one returns "0x". Precompiles are called directly with inputs
// whose expected outputs are known.
// Usage: node probe-opcodes.mjs [testnet|mainnet]
import { rpc, pickEnv } from './rpc.mjs';
import { writeFileSync } from 'node:fs';

const env = pickEnv(process.argv.slice(2));
const out = { env: env.name, rpc: env.rpc, checkedAt: new Date().toISOString(), opcodes: {}, precompiles: {} };

// init code snippets: execute the opcode, then STOP (0x00) or RETURN empty.
const OPCODES = [
  ['CHAINID (Istanbul)',        '0x465000'],
  ['SELFBALANCE (Istanbul)',    '0x475000'],
  ['BASEFEE (London)',          '0x485000'],
  ['PREVRANDAO (Paris)',        '0x445000'],
  ['PUSH0 (Shanghai)',          '0x5f5000'],
  ['TSTORE/TLOAD (Cancun)',     '0x600160005d60005c5000'],
  ['MCOPY (Cancun)',            '0x6000600060005e00'],
  ['BLOBHASH (Cancun)',         '0x6000495000'],
  ['BLOBBASEFEE (Cancun)',      '0x4a5000'],
];

const zeros = (n) => '00'.repeat(n);
const PRECOMPILES = [
  // [label, address, input, expectedPrefix or null]
  ['0x01 ecrecover',    '0x0000000000000000000000000000000000000001', '0x' + zeros(128), '0x'], // all-zero sig: Ethereum returns empty
  ['0x02 sha256',       '0x0000000000000000000000000000000000000002', '0x', '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['0x03 ripemd160',    '0x0000000000000000000000000000000000000003', '0x', '0x0000000000000000000000009c1185a5c5e9fc54612808977ee8f548b2258d31'],
  ['0x04 identity',     '0x0000000000000000000000000000000000000004', '0xdeadbeef', '0xdeadbeef'],
  ['0x05 modexp',       '0x0000000000000000000000000000000000000005', '0x' + zeros(31) + '01' + zeros(31) + '01' + zeros(31) + '01' + '020305', '0x03'], // 2^3 mod 5
  ['0x06 ecAdd',        '0x0000000000000000000000000000000000000006', '0x' + zeros(128), '0x' + zeros(64)],
  ['0x07 ecMul',        '0x0000000000000000000000000000000000000007', '0x' + zeros(96), '0x' + zeros(64)],
  ['0x08 ecPairing',    '0x0000000000000000000000000000000000000008', '0x', '0x' + zeros(31) + '01'],
  ['0x09 blake2f',      '0x0000000000000000000000000000000000000009', '0x' + zeros(213), null],
  ['0x0a kzg point eval (Cancun)', '0x000000000000000000000000000000000000000a', '0x' + zeros(192), null],
  // Prague (EIP-2537): G1ADD of two points at infinity returns the point at infinity (128 zero bytes).
  ['0x0b bls12 G1ADD (Prague)',   '0x000000000000000000000000000000000000000b', '0x' + zeros(256), '0x' + zeros(128)],
  ['0x10 bls12 MAP_FP_TO_G1 (Prague)', '0x0000000000000000000000000000000000000010', '0x' + zeros(64), null],
];
// Prague (EIP-2935): a system contract at a fixed address serves historical block hashes.
const HISTORY_CONTRACT = '0x0000F90827F1C53a10cb7A02335B175320002935';

function classify(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('invalid opcode') || m.includes('invalid instruction') || m.includes('bad instruction')) return 'unsupported';
  if (m.includes('revert')) return 'reverted';
  return 'error';
}

console.log(`\n== ${env.name} (${env.rpc}) ==\n\nOpcodes (via eth_call as init code):`);
for (const [label, data] of OPCODES) {
  try {
    const r = await rpc(env.rpc, 'eth_call', [{ data }, 'latest']);
    out.opcodes[label] = { status: 'supported', returned: r };
    console.log(`  ${label.padEnd(26)} supported`);
  } catch (e) {
    out.opcodes[label] = { status: classify(e), error: e.message };
    console.log(`  ${label.padEnd(26)} ${classify(e).padEnd(12)} ${e.message}`);
  }
}

console.log(`\nPrecompiles (via eth_call):`);
for (const [label, to, data, expected] of PRECOMPILES) {
  try {
    const r = await rpc(env.rpc, 'eth_call', [{ to, data }, 'latest']);
    const matches = expected == null ? null : r.toLowerCase() === expected.toLowerCase();
    const present = r !== '0x' || expected === '0x';
    out.precompiles[label] = { status: present ? 'present' : 'empty-return', returned: r, matches };
    console.log(`  ${label.padEnd(30)} ${present ? 'present' : 'EMPTY'} ${matches == null ? '' : matches ? '(expected output)' : '(UNEXPECTED output ' + r.slice(0, 20) + '...)'}`);
  } catch (e) {
    // The KZG precompile validates its input before doing anything; a "mismatched
    // versioned hash" error on our zero input means the precompile exists.
    const status = /versioned hash/i.test(e.message) ? 'present (rejected input)' : classify(e);
    out.precompiles[label] = { status, error: e.message };
    console.log(`  ${label.padEnd(30)} ${status.padEnd(12)} ${e.message}`);
  }
}

// EIP-2935 history contract: code at the fixed address means Prague's block-hash service is live.
try {
  const code = await rpc(env.rpc, 'eth_getCode', [HISTORY_CONTRACT, 'latest']);
  out.historyContract = { address: HISTORY_CONTRACT, codeBytes: (code.length - 2) / 2 };
  console.log(`\nEIP-2935 history contract ${HISTORY_CONTRACT}: ${out.historyContract.codeBytes} bytes of code`);
} catch (e) {
  out.historyContract = { address: HISTORY_CONTRACT, error: e.message };
}

// Conclusion helper
const ok = (k) => Object.entries(out.opcodes).find(([l]) => l.startsWith(k))?.[1].status === 'supported';
let fork = 'pre-Istanbul or non-standard';
if (ok('CHAINID')) fork = 'Istanbul';
if (ok('BASEFEE')) fork = 'London';
if (ok('PREVRANDAO')) fork = 'Paris';
if (ok('PUSH0')) fork = 'Shanghai';
if (ok('TSTORE') && ok('MCOPY')) fork = 'Cancun';
const bls = out.precompiles['0x0b bls12 G1ADD (Prague)'];
if (fork === 'Cancun' && bls?.matches && out.historyContract?.codeBytes > 0) fork = 'Prague';
out.inferredFork = fork;
out.compilerAdvice = fork === 'Prague' ? 'evmVersion "prague" is safe; "cancun" is the conservative pin'
  : ok('PUSH0') ? 'evmVersion may be shanghai or later' : 'set evmVersion: "paris" (no PUSH0)';
console.log(`\nInferred execution fork: ${fork}\nCompiler advice: ${out.compilerAdvice}`);

const file = `results/opcodes-${env.name}-${out.checkedAt.slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`Saved ${file}`);
