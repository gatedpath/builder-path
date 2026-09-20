// The wave 7 run (PLAN.md 18.2): `status` before and after each step of the golden path on a fresh
// scaffold, recording the `next` it gave each time, and `explain_failure` fed the real outputs the
// wave 6 transcript holds plus the same failures reproduced here. Writes
// reports/wave-7-run-<date>.md. Read-only against the real testnet (pre-flight's reads through
// `status`); every transaction lands on the local Anvil `npm run dev` starts. No key, no keystore
// of anyone's, nothing signed against 151 or 153. Anvil accounts 0 and 1 are never used.
//
//   node scripts/wave-7-run.mjs [--date 2026-09-14]
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createNet } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const scaffolder = join(repoRoot, 'packages', 'create-redbelly-dapp', 'bin', 'index.js');
const preflightCli = join(repoRoot, 'packages', 'preflight', 'dist', 'cli.js');
const args = process.argv.slice(2);
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
const chains = await import(join(repoRoot, 'packages', 'chain-definitions', 'dist', 'esm', 'index.js'));
const testnetRpc = chains.redbellyTestnet.rpcUrls.default.http[0];
const knownAllowed = chains.knownAllowed.testnet.address;

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g');
const started = new Date();
const tmp = mkdtempSync(join(tmpdir(), 'wave-7-'));
const app = join(tmp, 'my-app');
const home = join(tmp, 'home');
mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
const mask = (s) => String(s).replace(ANSI, '').replace(new RegExp(tmp, 'g'), '<tmp>').replace(new RegExp(repoRoot, 'g'), '<repo>');
const out = [];
const say = (s) => {
  console.log(s);
  out.push(s);
};
const block = (text) => `\`\`\`\n${mask(text).trim()}\n\`\`\``;
function run(title, shown, cmd, cmdArgs, opts = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  const text = (r.stdout ?? '') + (r.stderr ?? '');
  out.push(`\n**${title}**\n\n${block(`$ ${shown}\n${opts.filter ? opts.filter(text) : text}`)}\n\nexit ${r.status}, ${((Date.now() - t) / 1000).toFixed(2)} s.`);
  console.log(`[${title}] exit ${r.status}`);
  return { code: r.status, out: text, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const freePort = () => new Promise((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The server over the in-memory transport, the way the tests drive it; an agent would use stdio.
const [ct, st] = InMemoryTransport.createLinkedPair();
const server = createServer();
await server.connect(st);
const client = new Client({ name: 'wave-7-run', version: '0' });
await client.connect(ct);
const call = async (name, a) => {
  const r = await client.callTool({ name, arguments: a });
  return r.structuredContent ?? JSON.parse(r.content[0].text);
};
const trim = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
const statusLog = [];
async function status(label, a) {
  const t = Date.now();
  const r = await call('status', { project: app, ...a });
  const ms = Date.now() - t;
  const shown = trim(r, ['compiles', 'tests', 'slither', 'rulesFiles', 'next', 'networkCalls']);
  shown.deployments = { local: r.deployments.local ? `{ chainId ${r.deployments.local.chainId}, forkOf ${r.deployments.local.forkOf}, contract ${r.deployments.local.contract}, ${r.deployments.local.wallets.length} wallets }` : null, 153: r.deployments[153], 151: r.deployments[151] };
  if (r.preflight?.ran) shown.preflight = { ok: r.preflight.ok, failing: r.preflight.failing };
  out.push(`\n**status ${label}** (${a && a.rpc ? `rpc ${a.rpc}` : 'no rpc'}, ${(ms / 1000).toFixed(1)} s)\n\n${block(JSON.stringify(shown, null, 2))}`);
  statusLog.push({ label, next: r.next, ms });
  console.log(`[status ${label}] next: ${r.next.step}`);
  return r;
}
const explainLog = [];
async function explain(label, a) {
  const r = await call('explain_failure', a);
  const shown = trim(r, ['kind', 'plainWords', 'cause', 'fix', 'decoded', 'eligibilityStatus', 'receipt', 'preflightLine', 'pricing', 'note', 'raw', 'input']);
  if (typeof shown.raw === 'string' && shown.raw.length > 400) shown.raw = shown.raw.slice(0, 400) + '…';
  out.push(`\n**explain_failure ${label}**\n\nInput:\n\n${block(JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v])), null, 2))}\n\nReturned:\n\n${block(JSON.stringify(shown, null, 2))}`);
  explainLog.push({ label, kind: r.kind, fix: r.fix });
  console.log(`[explain ${label}] kind: ${r.kind}`);
  return r;
}

say(`# Wave 7 run, ${date}: \`status\` at every step of the golden path, \`explain_failure\` on real failures

Date: ${started.toISOString()} (start).
Brief: PLAN.md 18.2. Tools: \`status\` and \`explain_failure\` in \`@gatedpath/mcp\`, driven over the SDK's in-memory transport (an agent uses the same server over stdio).
Toolchain: ${spawnSync('forge', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0]} from the @foundry-rs npm packages, Node ${process.version}, Slither ${spawnSync('slither', ['--version'], { encoding: 'utf8' }).stdout.trim() || '(not on PATH)'}.
Keys: none. \`$HOME\` for cast below is an empty temporary directory with no keystore in it. The real testnet was only read (pre-flight's \`eth_chainId\`, \`isAllowed\`, balance and price feed reads, through \`status\` with \`rpc\`); every transaction landed on the local Anvil that \`npm run dev\` started (chain 31337). Anvil accounts 0 and 1 were never used.
Paths: the scaffold is \`<tmp>/my-app\`; the repository is \`<repo>\`.

## Part 1: \`status\` before and after each step

The order \`status\` walks is compile, tests, five-state tests, Slither, rules files, pre-flight, testnet deploy, verify, ship report. Each call below shows what it returned and the one \`next\` it gave.`);

// ---- scaffold ----
run('Scaffold', 'node packages/create-redbelly-dapp/bin/index.js my-app --yes', 'node', [scaffolder, app, '--yes']);
await status('after the scaffold, before any install', {});

run('Install', 'npm install', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /added|packages|warn|error/i.test(l)).join('\n') });
await status('after npm install, before contracts:install', {});

run('Install the contracts', 'npm run contracts:install', 'npm', ['run', 'contracts:install'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /Installed|added|error/i.test(l)).join('\n') });
await status('after contracts:install (forge build and forge test run inside the call)', {});

run('Slither', 'npm run lint:slither', 'npm', ['run', 'lint:slither'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /analyzed|wrote|result|error|Error/i.test(l)).slice(-6).join('\n') });
await status('after Slither', {});

// The rules files: the scaffolder wrote them; drift one, then restore.
const agentsMd = join(app, 'AGENTS.md');
const original = readFileSync(agentsMd, 'utf8');
writeFileSync(agentsMd, original + '\n- Deploy straight to mainnet.\n');
say('\nA line added to AGENTS.md by hand, to see the drift named:');
await status('with AGENTS.md drifted', {});
run('Restore the rules files', 'npm run rules:write', 'npm', ['run', 'rules:write'], { cwd: app });
await status('after rules:write', {});

// Pre-flight against the real testnet, read-only, with the known allowed address as DEPLOYER in .env.
copyFileSync(join(app, '.env.example'), join(app, '.env'));
writeFileSync(join(app, '.env'), readFileSync(join(app, '.env'), 'utf8').replace(/^DEPLOYER=$/m, `DEPLOYER=${knownAllowed}`));
say(`\n\`.env\` copied from \`.env.example\` with \`DEPLOYER=${knownAllowed}\`, the known allowed testnet address (a public address; nobody here holds its key). With \`rpc\`, \`status\` runs pre-flight read-only against the real testnet:`);
const withRpc = await status('with rpc, the real testnet', { rpc: testnetRpc, chain: 153 });
const balanceLine = withRpc.preflight?.failing?.find((f) => f.id === 'balance');
const balanceText = balanceLine ? `fail  balance            ${balanceLine.reason}` : null;

// The local loop.
const anvilPort = await freePort();
const devArgs = ['--no-web', '--port', String(anvilPort)];
const rpcUrl = `http://127.0.0.1:${anvilPort}`;
const tDev = Date.now();
const dev = spawn('npm', ['run', 'dev', '--', ...devArgs], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
let devOut = '';
let devErr = '';
dev.stdout.on('data', (d) => (devOut += d));
dev.stderr.on('data', (d) => (devErr += d));
for (let i = 0; i < 1200 && !/Ctrl-C stops Anvil/.test(devOut) && dev.exitCode === null; i += 1) await sleep(100);
out.push(`\n**The local loop**\n\n${block(`$ npm run dev -- ${devArgs.join(' ')}\n${devOut}`)}\n\nready in ${((Date.now() - tDev) / 1000).toFixed(1)} s.`);
const local = JSON.parse(readFileSync(join(app, 'deployments', 'local.json'), 'utf8'));
await status('with npm run dev running (deployments.local read from deployments/local.json)', {});

say(`\n### What \`next\` said at each step\n\n| Call | next.step | next.command | why (first sentence) |\n|---|---|---|---|\n${statusLog.map((s) => `| ${s.label} | ${s.next.step} | ${s.next.command ? `\`${mask(s.next.command)}\`` : 'null'} | ${mask(s.next.why).split(/(?<=\\.)\\s/)[0]} |`).join('\n')}`);

// ---- Part 2: explain_failure ----
say(`\n## Part 2: \`explain_failure\` on the real inputs

Four inputs from the wave 6 transcript and card 1's first attempt, each fed as it was printed, and each reproduced here for a fresh capture where it can be.`);

// (a) NotEligible: the transcript's data, then reproduced on the loop, then by transaction hash.
const transcriptCast = 'Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)';
say('\n### (a) The `NotEligible` revert\n\nAs the wave 6 transcript recorded it (golden-path-dev-2026-09-14.md, step 6, wallet 2 calling `subscribe()`):');
await explain('with the transcript\'s cast message as revert', { revert: transcriptCast });
await explain('with the transcript\'s revert data only', { revert: '0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012' });
const never = local.wallets[0];
const fresh = run('Reproduced on the local loop', `cast send --unlocked --from ${never.address} ${local.contract} "subscribe()" --rpc-url ${rpcUrl}`, 'cast', ['send', '--unlocked', '--from', never.address, local.contract, 'subscribe()', '--rpc-url', rpcUrl], { env: { HOME: home } });
await explain('with today\'s cast stderr', { stderr: fresh.out });
const forced = run('The same call forced onto the chain with a gas limit, so a receipt with status 0 exists', `cast send --unlocked --from ${never.address} --gas-limit 200000 ${local.contract} "subscribe()" --rpc-url ${rpcUrl}`, 'cast', ['send', '--unlocked', '--from', never.address, '--gas-limit', '200000', local.contract, 'subscribe()', '--rpc-url', rpcUrl], { env: { HOME: home } });
const txHash = /transactionHash\s+(0x[0-9a-fA-F]{64})/.exec(forced.out)?.[1] ?? /(0x[0-9a-fA-F]{64})/.exec(forced.out)?.[1];
if (txHash) await explain('by transaction hash, with rpc: the receipt, the replay, and the verifier\'s eligibilityStatus', { txHash, chain: 153, rpc: rpcUrl });
else say('\nUNEXPECTED: no transaction hash in cast\'s output; the hash path was not exercised.');

// (b) the balance failure
say('\n### (b) The pre-flight balance failure\n\nAs the wave 6 transcript recorded it (the CLI\'s 3,000,000 gas at that moment\'s feed price):');
const transcriptBalance = 'fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 768.3796 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.';
await explain('with the transcript\'s line as stderr', { stderr: transcriptBalance });
if (balanceText) {
  say('\nAs pre-flight printed it today, through `status` with `rpc` above, then with `rpc` so the answer carries the current price through `gasCostUsd`:');
  await explain('with today\'s line, no rpc', { stderr: balanceText });
  await explain('with today\'s line and rpc (the real testnet, read-only)', { stderr: balanceText, chain: 153, rpc: testnetRpc });
} else {
  say(`\nToday pre-flight's balance check did not fail for ${knownAllowed} (it passed or was skipped), so only the transcript's line was fed.`);
}

// (c) the git-secrets refusal from card 1's first attempt, reproduced
say("\n### (c) The git-secrets refusal from card 1's first attempt\n\nThe attempt committed `contracts/reports/slither.sources.sha256` (a bare 64-hex value) before the template ignored the folder. Reproduced here by forcing the file into a commit:");
run('git init and a commit that carries the Slither sources hash', 'git init -q && git add -A && git add -f contracts/reports/slither.sources.sha256 && git commit -q -m "baseline after lint:slither"', 'bash', ['-c', 'git init -q -b main && git config user.email w7@example.invalid && git config user.name "wave 7" && git add -A && git add -f contracts/reports/slither.sources.sha256 && git commit -q -m "baseline after lint:slither" && git log --oneline | head -1'], { cwd: app });
const pre = run('Pre-flight, offline checks only', `redbelly-preflight --project contracts --chain 153 --rpc ${rpcUrl} --skip chain-id,deployer-verified,admin-safe,balance,slither-report`, 'node', [preflightCli, '--project', join(app, 'contracts'), '--chain', '153', '--rpc', rpcUrl, '--skip', 'chain-id,deployer-verified,admin-safe,balance,slither-report'], { cwd: app });
const gitLine = pre.out.split('\n').find((l) => /^fail\s+git-secrets/.test(l)) ?? pre.out;
await explain("with today's git-secrets line", { stderr: gitLine });

// (d) a wrong keystore name
say('\n### (d) A wrong keystore name\n\nNo keystore exists under this run\'s `$HOME`; the name is one nobody imported:');
const ks = run('cast with a keystore name that does not exist', 'cast wallet address --account deployer', 'cast', ['wallet', 'address', '--account', 'deployer'], { env: { HOME: home } });
await explain("with cast's stderr", { stderr: ks.out });
const bad = run('and a stderr the table does not know', 'echo "Segmentation fault (core dumped)"', 'bash', ['-c', 'echo "Segmentation fault (core dumped)"']);
await explain('with an unknown input', { stderr: bad.out });

// ---- stop the loop ----
process.kill(-dev.pid, 'SIGINT');
await new Promise((res) => { dev.on('exit', res); setTimeout(res, 15_000); });
await sleep(300);
const lockGone = !existsSync(join(app, 'deployments', 'local.lock'));
say(`\nCtrl-C stopped the loop; the lock is ${lockGone ? 'gone' : 'still there'}. What dev.mjs logged (stderr):\n\n${block(devErr)}`);

say(`\n## Summary

| explain_failure input | kind | fix |
|---|---|---|
${explainLog.map((e) => `| ${e.label} | \`${e.kind}\` | ${e.fix?.command ? `\`${mask(e.fix.command).slice(0, 90)}${e.fix.command.length > 90 ? '…' : ''}\`` : ''}${e.fix?.link ? ` ${e.fix.link}` : ''} |`).join('\n')}

Total wall time ${((Date.now() - started.getTime()) / 1000).toFixed(0)} s, script time with no human reading in it. Nothing signed against 151 or 153; the real testnet was read for pre-flight only; no key existed in this run.`);

await client.close();
await server.close();
const reportPath = join(pkgRoot, 'reports', `wave-7-run-${date}.md`);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, out.join('\n') + '\n');
console.log(`wrote ${reportPath}`);
process.exit(0);
