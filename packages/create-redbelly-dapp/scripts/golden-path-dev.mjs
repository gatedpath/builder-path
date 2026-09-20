// Follows the site's /start page literally on a fresh gated-erc20 scaffold, the way it reads after
// wave 6 (PLAN.md 18.1): the local loop is `npm run dev`. Records every command, its output and
// its wall time to reports/golden-path-dev-<date>.md, and drives the dev state panel in a real
// browser (Playwright from site/node_modules) so the switcher is exercised, not described.
//
// Read-only against the real networks: the isAllowed reads, the pre-flight reads and the fork's
// state fetches. Every transaction lands on the local Anvil. No key, no wallet, nothing sent.
//
//   node scripts/golden-path-dev.mjs [--date 2026-09-14]
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const bin = join(pkgRoot, 'bin', 'index.js');
const preflightCli = resolve(pkgRoot, '..', 'preflight', 'dist', 'cli.js');
const args = process.argv.slice(2);
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
// `--suffix b` writes golden-path-dev-<date>b.md, for a second run on one day.
const suffix = args.includes('--suffix') ? args[args.indexOf('--suffix') + 1] : '';
const chains = await import(resolve(pkgRoot, '..', 'chain-definitions', 'dist', 'esm', 'index.js'));
const testnetRpc = chains.redbellyTestnet.rpcUrls.default.http[0];
const permission = chains.addresses.testnet.permission.address;
const knownAllowed = chains.knownAllowed.testnet.address;
const playwright = createRequire(`file://${resolve(repoRoot, 'site', 'package.json')}`)('playwright');
const chromiumPath = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')) ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined);
const chromiumOptions = { ...(chromiumPath ? { executablePath: chromiumPath } : {}), args: ['--no-sandbox'] };

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g');
const started = new Date();
const tmp = mkdtempSync(join(tmpdir(), 'golden-path-dev-'));
const app = join(tmp, 'my-app');
const contracts = join(app, 'contracts');
const mask = (s) => String(s).replace(ANSI, '').replace(new RegExp(tmp, 'g'), '<tmp>').replace(new RegExp(repoRoot, 'g'), '<repo>');
const transcript = [];
const timings = [];
const notes = [];
const say = (s) => {
  console.log(s);
  transcript.push(s);
};
function record(step, title, shown, output, { code, ms }) {
  transcript.push(`\n### ${step}: ${title}\n\n\`\`\`\n$ ${shown}\n${mask(output).trim()}\n\`\`\`\n\nexit ${code}, ${(ms / 1000).toFixed(2)} s wall.`);
  timings.push({ step, title, ms, code });
  console.log(`[${step}] ${title}: exit ${code}, ${(ms / 1000).toFixed(2)} s`);
}
function run(step, title, shown, cmd, cmdArgs, opts = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  record(step, title, shown, opts.filter ? opts.filter(out) : out, { code: r.status, ms: Date.now() - t });
  return { code: r.status, out, stdout: r.stdout ?? '' };
}
const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const portFree = (port) =>
  new Promise((res) => {
    const s = createServer();
    s.once('error', () => res(false));
    s.listen(port, '127.0.0.1', () => s.close(() => res(true)));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForHttp(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  return false;
}

say(`# Golden path, ${date}: the /start page followed literally, with \`npm run dev\` as the local loop

Date: ${started.toISOString()} (start).
Page: \`site/src/content/docs/start.mdx\` as rewritten for wave 6 (PLAN.md 18.1), read as a first-time builder would.
Scaffolder: create-redbelly-dapp ${JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version}, \`--yes\` (gated-erc20, npm, web app; Foundry only, the wave 8 default, no Hardhat view).
Toolchain: ${spawnSync('forge', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0]} from the @foundry-rs npm packages, Node ${process.version}, npm ${spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim()}, Slither ${spawnSync('slither', ['--version'], { encoding: 'utf8' }).stdout.trim() || '(not on PATH)'}, Playwright ${playwright.chromium.name()} for the browser steps.
Keys: none. This session held no wallet, no keystore and no key. The real networks were only read (\`eth_call\`, \`eth_chainId\`, a balance, Routescan's endpoint form); every transaction below landed on the local Anvil that \`npm run dev\` started. Anvil's accounts 0 and 1 were never used.

The previous run of this page (12 September 2026, \`golden-path-foundry.md\`) took nineteen minutes wall, including two scaffolder fixes and the re-runs they caused, and its local loop was six commands across two shells. This run follows the rewritten page, where the local loop is one command. The timings table at the end is the measurement; the total is the whole script's wall time, tool time and waiting included, with no human reading time in it.`);

// Step 1: the isAllowed read, read-only against the real testnet.
run('Step 1', 'the isAllowed read against the real testnet RPC (read-only), the known allowed address', `cast call ${permission} "isAllowed(address)(bool)" ${knownAllowed} --rpc-url ${testnetRpc}`, 'cast', ['call', permission, 'isAllowed(address)(bool)', knownAllowed, '--rpc-url', testnetRpc]);
run('Step 1', 'the same read for the zero address', `cast call ${permission} "isAllowed(address)(bool)" 0x0000000000000000000000000000000000000000 --rpc-url ${testnetRpc}`, 'cast', ['call', permission, 'isAllowed(address)(bool)', '0x0000000000000000000000000000000000000000', '--rpc-url', testnetRpc]);

// Step 3: the toolchain.
run('Step 3', 'the toolchain (Foundry from the @foundry-rs npm packages); the keystore import is not run, no key here', 'forge --version && anvil --version | head -1', 'bash', ['-c', 'forge --version && anvil --version | head -1']);

// Step 4: scaffold.
run('Step 4', 'scaffold with the defaults', 'node packages/create-redbelly-dapp/bin/index.js my-app --yes', 'node', [bin, app, '--yes']);

// Step 5: doctor on the bare scaffold, then install.
run('Step 5', 'npm run doctor on the bare scaffold: the machine before the first command (Node, git, forge, anvil, cast, one version, real binaries, slither, aderyn, .env, vendor/)', 'npm run doctor', 'npm', ['run', 'doctor'], { cwd: app });
run('Step 5', 'npm install at the project root (web app, vendored packages)', 'npm install', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /added|packages|warn|error/i.test(l)).join('\n') });
run('Step 5', 'npm run contracts:install (OpenZeppelin from npm, forge-std with forge install --no-git)', 'npm run contracts:install', 'npm', ['run', 'contracts:install'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /Installed|added|error/i.test(l)).join('\n') });

// Step 6: the local loop.
const anvilPort = (await portFree(8545)) ? 8545 : await freePort();
const webPort = (await portFree(3000)) ? 3000 : await freePort();
const devArgs = [...(anvilPort === 8545 ? [] : ['--port', String(anvilPort)]), ...(webPort === 3000 ? [] : ['--web-port', String(webPort)])];
const devShown = `npm run dev${devArgs.length ? ` -- ${devArgs.join(' ')}` : ''}`;
const rpcUrl = `http://127.0.0.1:${anvilPort}`;
const tDev = Date.now();
// Its own process group, so the Ctrl-C below reaches npm, the shell it runs and dev.mjs together,
// exactly as a terminal delivers it. (A signal to npm alone is not forwarded to the script.)
const dev = spawn('npm', ['run', 'dev', ...(devArgs.length ? ['--', ...devArgs] : [])], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
let devOut = '';
let devErr = '';
dev.stdout.on('data', (d) => (devOut += d));
dev.stderr.on('data', (d) => (devErr += d));
let tableAt = null;
for (let i = 0; i < 1200 && tableAt === null; i += 1) {
  if (/Ctrl-C stops Anvil/.test(devOut)) tableAt = Date.now();
  else if (dev.exitCode !== null) break;
  else await sleep(100);
}
const readyMs = tableAt ? tableAt - tDev : null;
const tableText = devOut.split('\n').filter((l) => !l.startsWith('[web]')).join('\n');
record('Step 6', 'npm run dev: fork 153, deploy, seed five wallets, start the web app (stdout, the table)', devShown, tableText, { code: dev.exitCode ?? 0, ms: readyMs ?? Date.now() - tDev });
transcript.push(`\nWhat the script logged while it worked (stderr):\n\n\`\`\`\n${mask(devErr).trim()}\n\`\`\``);
const recordPath = join(app, 'deployments', 'local.json');
const local = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
if (!local) {
  say('\nUNEXPECTED: npm run dev did not write deployments/local.json; stopping.');
  process.kill(-dev.pid, 'SIGINT');
  process.exit(1);
}
transcript.push(`\n\`deployments/local.json\` as written (account indices, never a key):\n\n\`\`\`\n${readFileSync(recordPath, 'utf8').trim()}\n\`\`\``);

// The web app: wait for it, then the switcher in a real browser.
const webUrl = `http://localhost:${webPort}`;
const tWeb = Date.now();
const webUp = await waitForHttp(`${webUrl}/eligibility`, 240_000);
record('Step 6', 'the web app answers on /eligibility (Next.js dev server, first compile included)', `curl -s -o /dev/null -w '%{http_code}' ${webUrl}/eligibility`, webUp ? '200' : 'no answer in 240 s', { code: webUp ? 0 : 1, ms: Date.now() - tWeb });
let panelNote = 'not run';
if (webUp) {
  const browser = await playwright.chromium.launch(chromiumOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let loads = 0;
    page.on('load', () => (loads += 1));
    const t1 = Date.now();
    await page.goto(`${webUrl}/eligibility`, { waitUntil: 'load' });
    const panel = page.locator('.rb-devstate');
    await panel.waitFor({ timeout: 120_000 });
    const rows = panel.locator('tbody tr');
    const states = await rows.locator('td:nth-child(2)').allTextContents();
    record('Step 6', 'the dev state panel on /eligibility (browser): five wallets in enum order', `open ${webUrl}/eligibility`, `panel rows: ${await rows.count()}\n${states.map((s, i) => `wallet ${local.wallets[i].index}: ${s.trim()}`).join('\n')}`, { code: 0, ms: Date.now() - t1 });
    const t2 = Date.now();
    await rows.nth(1).getByRole('button', { name: 'Connect' }).click();
    await rows.nth(1).getByText('connected').waitFor({ timeout: 30_000 });
    await page.locator('.rb-elig-title', { hasText: /^Eligible$/ }).waitFor({ timeout: 60_000 });
    record('Step 6', 'connect wallet 3 (Valid) with no key: the gate shows Eligible', 'click Connect on wallet 3', `row: ${(await rows.nth(1).textContent()).trim()}\ngate: ${(await page.locator('.rb-elig-title').first().textContent()).trim()}`, { code: 0, ms: Date.now() - t2 });
    const t3 = Date.now();
    await panel.getByRole('button', { name: 'Expired', exact: true }).click();
    await panel.getByText(/is now Expired/).waitFor({ timeout: 30_000 });
    await page.locator('.rb-elig-title', { hasText: 'Not eligible for this action' }).waitFor({ timeout: 30_000 });
    record('Step 6', 'flip the connected wallet to Expired: setStatus as the impersonated deployer, the page re-renders without a reload', 'click Expired', `panel: ${(await panel.locator('.rb-devstate-message').textContent()).trim()}\ngate: ${(await page.locator('.rb-elig-title').first().textContent()).trim()}\npage loads since open: ${loads}`, { code: 0, ms: Date.now() - t3 });
    await page.screenshot({ path: join(tmp, 'panel.png'), fullPage: false });
    const t4 = Date.now();
    await panel.getByRole('button', { name: 'Valid', exact: true }).click();
    await page.locator('.rb-elig-title', { hasText: /^Eligible$/ }).waitFor({ timeout: 30_000 });
    record('Step 6', 'and back to Valid', 'click Valid', `gate: ${(await page.locator('.rb-elig-title').first().textContent()).trim()}\npage loads since open: ${loads}\nbrowser errors: ${errors.length ? errors.join('; ') : 'none'}`, { code: errors.length ? 1 : 0, ms: Date.now() - t4 });
    panelNote = `run: connect, Expired, Valid, ${loads === 1 ? 'no reload' : `${loads} loads`}, ${errors.length} browser errors`;
    await page.close();
  } finally {
    await browser.close();
  }
}

// Break it from the shell, on the local loop: NeverIssued reverts, Valid succeeds, then flip one with cast.
const rpc = ['--rpc-url', rpcUrl];
const [never, valid, expired] = local.wallets;
run('Step 6', 'break it: wallet 2 (NeverIssued) calls subscribe() and the contract refuses', `cast send --unlocked --from ${never.address} ${local.contract} "subscribe()" --rpc-url ${rpcUrl}`, 'cast', ['send', '--unlocked', '--from', never.address, local.contract, 'subscribe()', ...rpc], { filter: (o) => o.split('\n').filter((l) => /Error|revert|NotEligible/i.test(l)).join('\n') || o });
run('Step 6', 'wallet 3 (Valid) calls subscribe() and it goes through', `cast send --unlocked --from ${valid.address} ${local.contract} "subscribe()" --rpc-url ${rpcUrl}`, 'cast', ['send', '--unlocked', '--from', valid.address, local.contract, 'subscribe()', ...rpc], { filter: (o) => o.split('\n').filter((l) => /status|blockNumber|transactionHash/.test(l)).join('\n') });
run('Step 6', 'its balance afterwards', `cast call ${local.contract} "balanceOf(address)(uint256)" ${valid.address} --rpc-url ${rpcUrl}`, 'cast', ['call', local.contract, 'balanceOf(address)(uint256)', valid.address, ...rpc]);
run('Step 6', 'the same flip from the shell: wallet 4 (Expired) to Valid, as the table\'s footer says', `cast send ${local.verifier} "setStatus(address,uint64,uint8)" ${expired.address} 18 1 --unlocked --from ${local.deployer.address} --rpc-url ${rpcUrl} && cast call ${local.verifier} "eligibilityStatus(address,uint64)(uint8)" ${expired.address} 18 --rpc-url ${rpcUrl}`, 'bash', ['-c', `cast send ${local.verifier} "setStatus(address,uint64,uint8)" ${expired.address} 18 1 --unlocked --from ${local.deployer.address} --rpc-url ${rpcUrl} | grep -E 'status' && cast call ${local.verifier} "eligibilityStatus(address,uint64)(uint8)" ${expired.address} 18 --rpc-url ${rpcUrl}`]);
run('Step 6', 'a second npm run dev while the first runs', 'npm run dev', 'node', ['scripts/dev.mjs'], { cwd: app });

// Ctrl-C.
const tStop = Date.now();
process.kill(-dev.pid, 'SIGINT');
// npm relays the signal and ends by it (no exit code); dev.mjs itself exits 0 on SIGINT, which
// test/dev.test.mjs asserts by spawning the script directly. What proves the stop here is what is
// left running: nothing.
const devExit = await new Promise((res) => {
  if (dev.exitCode !== null || dev.signalCode) return res(dev.exitCode ?? `ended by ${dev.signalCode}`);
  dev.on('exit', (c, sig) => res(c ?? `ended by ${sig}`));
});
let anvilGone = false;
for (let i = 0; i < 50 && !anvilGone; i += 1) {
  anvilGone = spawnSync('cast', ['chain-id', ...rpc], { encoding: 'utf8' }).status !== 0;
  if (!anvilGone) await sleep(100);
}
const webGone = !(await waitForHttp(webUrl, 1500));
const lockGone = !existsSync(join(app, 'deployments', 'local.lock'));
record('Step 6', 'Ctrl-C: Anvil and the web app stop together', '^C', `npm run dev: ${devExit} (npm relays Ctrl-C to scripts/dev.mjs, which exits 0; the scaffolder's test/dev.test.mjs asserts that code)\nanvil on ${rpcUrl}: ${anvilGone ? 'stopped' : 'STILL ANSWERING'}\nweb on ${webUrl}: ${webGone ? 'stopped' : 'STILL ANSWERING'}\ndeployments/local.lock: ${lockGone ? 'removed' : 'STILL THERE'}\ndeployments/local.json: ${existsSync(recordPath) ? 'kept' : 'MISSING'}`, { code: anvilGone && webGone && lockGone ? 0 : 1, ms: Date.now() - tStop });

// Step 7: rules.
run('Step 7', 'the rules files have not drifted', 'npm run rules:check', 'npm', ['run', 'rules:check'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /ok|drift|missing|match/i.test(l)).join('\n') || o });

// Step 8: the gate and its tests.
run('Step 8', 'forge build (already compiled by npm run dev; a no-op here)', 'cd contracts && forge build', 'forge', ['build'], { cwd: contracts });
run('Step 8', 'forge test: every gated function in five states, fuzz and invariants', 'npm test', 'forge', ['test', '--summary'], { cwd: contracts, filter: (o) => o.split('\n').filter((l) => /Ran |passed|failed|╭|│|╰/.test(l)).join('\n') });
run('Step 8', 'forge fmt --check', 'cd contracts && forge fmt --check src script test', 'forge', ['fmt', '--check', 'src', 'script', 'test'], { cwd: contracts });

// Step 9: checks before signing. Slither on the scaffold npm run dev produced, then both pre-flights read-only.
run('Step 9', 'Slither through the scaffold script (writes the report and the sources hash)', 'npm run lint:slither', 'npm', ['run', 'lint:slither'], { cwd: app, filter: (o) => o.split('\n').filter((l) => /wrote|analyzed|result|error|Error/i.test(l)).join('\n') || o.slice(-1500) });
run('Step 9', 'the scaffold pre-flight, read-only against the real testnet with a public address', `DEPLOYER=${knownAllowed} npm run preflight`, 'npm', ['run', 'preflight'], { cwd: app, env: { DEPLOYER: knownAllowed } });
run('Step 9', 'redbelly-preflight, the seven-check CLI, read-only against the real testnet from contracts/', `cd contracts && redbelly-preflight --chain 153 --address ${knownAllowed}`, 'node', [preflightCli, '--chain', '153', '--address', knownAllowed], { cwd: contracts });
run('Step 9', 'the mainnet refusal, rehearsed offline', 'npm run preflight -- --chain 151 --offline', 'npm', ['run', 'preflight', '--', '--chain', '151', '--offline'], { cwd: app });
run('Step 9', 'the gas report in RBNT and US cents, read-only against the real testnet (the snapshot forge test wrote, one row per test; --report prices each function)', 'npm run snapshot && npm run gas -- --chain 153', 'bash', ['-c', 'npm run snapshot --silent >/dev/null && npm run gas --silent -- --chain 153'], { cwd: app });

// Step 11: Routescan dry run against the token npm run dev deployed on Anvil (nothing submitted).
const ctor = spawnSync('cast', ['abi-encode', 'constructor(string,string,(address,address,address,address),address,uint64,uint256)', 'Gated Token', 'GTOK', `(${local.deployer.address},${local.deployer.address},${local.deployer.address},${local.deployer.address})`, local.verifier, '18', '100000000000000000000'], { encoding: 'utf8' }).stdout.trim();
run('Step 11', 'Routescan verification dry run: the standard JSON input forge would send for the token the local loop deployed', `cd contracts && forge verify-contract ${local.contract} src/GatedERC20.sol:GatedERC20 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args $(cast abi-encode "constructor(string,string,(address,address,address,address),address,uint64,uint256)" "Gated Token" GTOK "(<admin>,<admin>,<admin>,<admin>)" <verifier> 18 100000000000000000000) --show-standard-json-input | wc -c`, 'bash', ['-c', `forge verify-contract ${local.contract} src/GatedERC20.sol:GatedERC20 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args ${ctor} --show-standard-json-input | wc -c`], { cwd: contracts });

// Done.
const total = Date.now() - started.getTime();
const fmt = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} min ${((ms % 60_000) / 1000).toFixed(0)} s` : `${(ms / 1000).toFixed(1)} s`);
say(`\n## Timings\n\nEvery row is a measured wall time from this run. The total is the whole script, waiting included.\n\n| Step | Wall time | Exit |\n|---|---|---|\n${timings.map((t) => `| ${t.step}: ${t.title} | ${fmt(t.ms)} | ${t.code} |`).join('\n')}\n| **Total, start to end** | **${fmt(total)}** | |\n\n\`npm run dev\` alone, from the command to the table: ${readyMs === null ? 'not measured' : fmt(readyMs)}. The web app's first compile after that: ${fmt(timings.find((t) => /answers on \/eligibility/.test(t.title))?.ms ?? 0)}. The panel ${panelNote}.\n\nPrevious run (12 September 2026, \`golden-path-foundry.md\`): nineteen minutes wall including two scaffolder fixes; its scaffold-to-fork-deploy tool time was under three minutes across six commands in two shells.`);
say(`\n## What did not run\n\nThe keystore import (no key in any recorded session), the deploy to the real testnet and the Routescan submission (wallet-signed, not made yet), and the real network's error to an unverified wallet (a fork and a local Anvil do not enforce the node-level permission map). The page marks each as pending.\n\nFinished ${new Date().toISOString()} (${fmt(total)}).`);

const outPath = join(pkgRoot, 'reports', `golden-path-dev-${date}${suffix}.md`);
writeFileSync(outPath, transcript.join('\n') + '\n');
if (existsSync(join(tmp, 'panel.png'))) copyFileSync(join(tmp, 'panel.png'), join(pkgRoot, 'reports', `golden-path-dev-${date}${suffix}-panel.png`));
rmSync(tmp, { recursive: true, force: true });
console.log(`\nwrote ${outPath}`);
