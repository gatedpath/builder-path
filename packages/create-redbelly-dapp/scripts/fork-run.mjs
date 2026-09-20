// Runs a fresh gated-erc20 scaffold against `anvil --fork-url <testnet>` and writes the
// transcript to reports/fork-run.md. Read-only against the real network (the fork reads
// state; every transaction lands on the local anvil). No key: the fork's unlocked accounts
// and an impersonated wallet sign locally.
//
//   node scripts/fork-run.mjs [--rpc https://governors.testnet.redbelly.network]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const bin = join(pkgRoot, 'bin', 'index.js');
const args = process.argv.slice(2);
const chains = await import(resolve(pkgRoot, '..', 'chain-definitions', 'dist', 'esm', 'index.js'));
const forkUrl = args.includes('--rpc') ? args[args.indexOf('--rpc') + 1] : chains.redbellyTestnet.rpcUrls.default.http[0];
const transcript = [];
const say = (s) => {
  console.log(s);
  transcript.push(s);
};
const block = (title, cmd, text) => transcript.push(`\n### ${title}\n\n\`\`\`\n$ ${cmd}\n${text.trim()}\n\`\`\``);
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  return { code: r.status, out: ((r.stdout ?? '') + (r.stderr ?? '')).replace(ANSI, '') };
}
const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const started = new Date();
const tmp = mkdtempSync(join(tmpdir(), 'redbelly-fork-run-'));
const app = join(tmp, 'fork-app');
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
say(
  `# Fork run: gated-erc20 scaffold against a testnet fork\n\nDate: ${started.toISOString()}\nFork source: ${forkUrl} (chain ${chains.redbellyTestnet.id})\nScaffolder: create-redbelly-dapp ${version}\nFoundry: ${run('forge', ['--version']).out.split('\n')[0]}\n\nEvery transaction below landed on the local anvil. Nothing was sent to the real network; the fork only read its state.`,
);

const port = await freePort();
const rpcUrl = `http://127.0.0.1:${port}`;
const anvil = spawn('anvil', ['--fork-url', forkUrl, '--port', String(port), '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
  let ready = false;
  for (let i = 0; i < 300 && !ready; i += 1) {
    ready = run('cast', ['chain-id', '--rpc-url', rpcUrl]).code === 0;
    if (!ready) await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error('anvil fork did not start (is the testnet RPC reachable?)');
  const rpc = ['--rpc-url', rpcUrl];
  const chainId = run('cast', ['chain-id', ...rpc]).out.trim();
  const forkBlock = run('cast', ['block-number', ...rpc]).out.trim();
  block('anvil fork', `anvil --fork-url ${forkUrl} --port ${port}`, `chain id ${chainId}, forked at block ${forkBlock}`);

  let r = run('node', [bin, app, '--yes', '--no-web']);
  block('scaffold', 'node bin/index.js fork-app --yes --no-web', r.out.replace(new RegExp(tmp, 'g'), '<tmp>'));
  if (r.code !== 0) throw new Error('scaffold failed');
  r = run('npm', ['run', 'contracts:install'], { cwd: app });
  block('forge install', 'npm run contracts:install', r.out.split('\n').filter((l) => /Installed|error/i.test(l)).join('\n') || r.out);
  const contracts = join(app, 'contracts');
  r = run('forge', ['build'], { cwd: contracts });
  block('forge build', 'forge build', r.out);
  r = run('forge', ['test', '--summary'], { cwd: contracts });
  block('forge test', 'forge test --summary', r.out.split('\n').filter((l) => /Ran |passed|failed|╭|│|╰/.test(l)).join('\n'));

  // The registry and permission contract are the real ones, read through the fork.
  const registry = chains.addresses.testnet.bootstrapRegistry.address;
  const permission = run('cast', ['call', registry, 'getContractAddress(string)(address)', 'permission', ...rpc]).out.trim();
  block(
    'registry on the fork',
    `cast call ${registry} "getContractAddress(string)(address)" permission`,
    `${permission}\n(expected ${chains.addresses.testnet.permission.address} from @gatedpath/chains)`,
  );

  // Pick a sender the real permission contract refuses. anvil's well-known accounts are not a
  // safe bet: on 2026-09-12 the testnet gate answered true for account 0 (0xf39F...2266), which
  // someone evidently verified with the public Hardhat/anvil key. So ask the fork, and fall back
  // to a fresh address that is impersonated and funded locally.
  const accounts = JSON.parse(run('cast', ['rpc', 'eth_accounts', ...rpc]).out);
  const allowedNotes = [];
  let unverified = null;
  for (const a of accounts.slice(0, 3)) {
    const ok = run('cast', ['call', permission, 'isAllowed(address)(bool)', a, ...rpc]).out.trim();
    allowedNotes.push(`${a}: isAllowed ${ok}`);
    if (ok === 'false' && !unverified) unverified = a;
  }
  if (!unverified) {
    unverified = '0x00000000000000000000000000000000000000aa';
    run('cast', ['rpc', 'anvil_impersonateAccount', unverified, ...rpc]);
    run('cast', ['rpc', 'anvil_setBalance', unverified, '0x' + (10n ** 21n).toString(16), ...rpc]);
    allowedNotes.push(`${unverified}: fresh address, impersonated and funded locally`);
  }
  block('choosing an unverified sender', `cast call ${permission} "isAllowed(address)(bool)" <anvil accounts>`, allowedNotes.join('\n'));
  const script = ['script', 'script/Deploy.s.sol', ...rpc, '--unlocked', '--broadcast'];
  const env = { RECORD_DEPLOYMENT: 'false' };
  const interesting = (text) => text.split('\n').filter((l) => /chain id|deployer|isAllowed|ADMIN_SAFE|admin:|VERIFIER|MOCK|GatedERC20|verifier:|ONCHAIN|Error|Total Paid|Estimated|revert/i.test(l)).join('\n');

  // 1. An unverified sender is refused by the real permission contract.
  r = run('forge', [...script, '--sender', unverified], { cwd: contracts, env });
  block('deploy with an unverified sender (refused)', `forge script script/Deploy.s.sol --rpc-url anvil --sender ${unverified} --unlocked --broadcast`, interesting(r.out));
  const refused = r.code !== 0 && /deployer fails permission\.isAllowed/.test(r.out);
  say(refused ? '\nRefused, as expected: the real permission contract says this sender has never been verified at access.redbelly.network.' : r.code !== 0 ? '\nUNEXPECTED: the script failed for a reason other than the gate (see above).' : '\nUNEXPECTED: the unverified sender was accepted.');

  // 2. Impersonate a wallet that isAllowed on 153 (a third party recorded in chain-definitions
  //    as the live test's positive control) and deploy on the fork with a ReceptorMock verifier.
  const allowed = chains.knownAllowed.testnet.address;
  run('cast', ['rpc', 'anvil_impersonateAccount', allowed, ...rpc]);
  run('cast', ['rpc', 'anvil_setBalance', allowed, '0x' + (10n ** 21n).toString(16), ...rpc]);
  const isAllowed = run('cast', ['call', permission, 'isAllowed(address)(bool)', allowed, ...rpc]).out.trim();
  block('impersonate a verified wallet', `cast rpc anvil_impersonateAccount ${allowed}\ncast call ${permission} "isAllowed(address)(bool)" ${allowed}`, `isAllowed: ${isAllowed}`);
  r = run('forge', [...script, '--sender', allowed], { cwd: contracts, env });
  block('deploy with the impersonated verified wallet (accepted)', `forge script script/Deploy.s.sol --rpc-url anvil --sender ${allowed} --unlocked --broadcast`, interesting(r.out));
  const token = r.out.match(/GatedERC20: (0x[0-9a-fA-F]{40})/)?.[1];
  const verifier = r.out.match(/verifier: (0x[0-9a-fA-F]{40})/)?.[1];
  say(r.code === 0 && token ? `\nDeployed on the fork: GatedERC20 at ${token}, ReceptorMock verifier at ${verifier}.` : '\nUNEXPECTED: the deploy with a verified sender failed.');

  if (token) {
    // 3. The gate on the fork: subscribe is refused until the mock marks the wallet Valid.
    run('cast', ['send', '--unlocked', '--from', allowed, token, 'setSubscriptionsOpen(bool)', 'true', ...rpc]);
    const before = run('cast', ['send', '--unlocked', '--from', allowed, token, 'subscribe()', ...rpc]);
    const setStatus = run('cast', ['send', '--unlocked', '--from', allowed, verifier, 'setStatus(address,uint64,uint8)', allowed, '1', '1', ...rpc]);
    const after = run('cast', ['send', '--unlocked', '--from', allowed, token, 'subscribe()', ...rpc]);
    const balance = run('cast', ['call', token, 'balanceOf(address)(uint256)', allowed, ...rpc]).out.trim();
    block(
      'the gate on the fork',
      `cast send ${token} "subscribe()"            # status NeverIssued\ncast send ${verifier} "setStatus(address,uint64,uint8)" ${allowed} 1 1   # Valid\ncast send ${token} "subscribe()"            # status Valid\ncast call ${token} "balanceOf(address)(uint256)" ${allowed}`,
      `first subscribe: ${before.code === 0 ? 'UNEXPECTEDLY SUCCEEDED' : 'reverted (' + (before.out.match(/NotEligible[^\n]*/)?.[0] ?? 'see revert data') + ')'}\nsetStatus: ${setStatus.code === 0 ? 'ok' : 'FAILED ' + setStatus.out.slice(-300)}\nsecond subscribe: ${after.code === 0 ? 'succeeded' : 'FAILED ' + after.out.slice(-300)}\nbalance: ${balance}`,
    );
  }

  // 4. Fees on a fork don't follow the price oracle.
  const gasPrice = run('cast', ['gas-price', ...rpc]).out.trim();
  const price = await chains.getLatestPrice({ rpc: forkUrl }).catch(() => null);
  block('fees', 'cast gas-price --rpc-url anvil', `${gasPrice} wei on the fork; the real feed says US$${price?.usdPerRbnt ?? '?'} per RBNT. Fee figures on a fork mean nothing; assert gas used, never a fee.`);
} finally {
  anvil.kill();
  rmSync(tmp, { recursive: true, force: true });
}
say(`\nFinished ${new Date().toISOString()} (${Math.round((Date.now() - started.getTime()) / 1000)} s).`);
const out = join(pkgRoot, 'reports', 'fork-run.md');
writeFileSync(out, transcript.join('\n') + '\n');
console.log(`\nwrote ${out}`);
