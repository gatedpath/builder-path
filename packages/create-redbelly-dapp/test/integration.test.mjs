// Integration test for create-redbelly-dapp. Scaffolds the two shipped templates into a temp
// directory with --yes, builds and tests the contracts with forge, checks the rules files,
// builds the web app for gated-erc20, and proves the deploy script's mainnet refusal and
// acceptance on a simulated chain 151 (anvil) with the real Safe 1.4.1 bytecode.
//
// Needs forge, anvil and cast on PATH and network access for `forge install` and npm.
// Nothing here touches a real network; the fork run is a separate script (npm run test:fork).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const bin = join(pkgRoot, 'bin', 'index.js');
const fixtures = join(here, 'fixtures', 'safe-1.4.1');
const keep = process.env.KEEP_SCAFFOLD === '1';

const tmp = mkdtempSync(join(tmpdir(), 'create-redbelly-dapp-'));
const erc20Dir = join(tmp, 'gated-app');
const emptyDir = join(tmp, 'empty-app');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '' };
}
function must(cmd, args, opts = {}) {
  const r = run(cmd, args, opts);
  assert.equal(r.code, 0, `${cmd} ${args.join(' ')} failed:\n${r.out.slice(-4000)}`);
  return r;
}
function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}
async function startAnvil(args) {
  const port = await freePort();
  const child = spawn('anvil', ['--port', String(port), '--silent', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    const r = run('cast', ['chain-id', '--rpc-url', url]);
    if (r.code === 0) return { child, url, port };
    await new Promise((r2) => setTimeout(r2, 100));
  }
  child.kill();
  throw new Error('anvil did not start');
}

before(() => {
  for (const tool of ['forge', 'anvil', 'cast']) {
    assert.equal(run(tool, ['--version']).code, 0, `${tool} must be on PATH (install Foundry: https://getfoundry.sh)`);
  }
  must('node', [join(pkgRoot, 'scripts', 'build-siblings.mjs')]);
});

after(() => {
  if (!keep) rmSync(tmp, { recursive: true, force: true });
  else console.log(`kept ${tmp}`);
});

test('the two stub templates refuse with a clear message', () => {
  for (const t of ['gated-erc721', 'gated-vault']) {
    const r = run('node', [bin, join(tmp, `stub-${t}`), '--yes', '--template', t]);
    assert.equal(r.code, 2, `stub ${t} should exit 2`);
    assert.match(r.out, /not shipped yet/);
    assert.match(r.out, /is missing:/);
    assert.ok(!existsSync(join(tmp, `stub-${t}`, 'package.json')), 'a stub must not leave a half-scaffolded project');
  }
});

test('the default scaffold is Foundry only: no hardhat/ without --hardhat', () => {
  const dir = join(tmp, 'default-app');
  const r = must('node', [bin, dir, '--yes', '--no-web']);
  assert.match(r.out, /Scaffolded gated-erc20/);
  assert.ok(!existsSync(join(dir, 'hardhat')), 'no hardhat/ by default since wave 8');
  assert.ok(existsSync(join(dir, 'contracts', 'foundry.toml')));
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.ok(!pkg.workspaces.includes('hardhat'));
  assert.doesNotMatch(readFileSync(join(dir, 'README.md'), 'utf8'), /hardhat/i, 'the README of a Foundry-only scaffold does not mention Hardhat');
  assert.doesNotMatch(r.out, /hardhat\/ folder compiles/);
  rmSync(dir, { recursive: true, force: true });
});

test('scaffold gated-erc20 with --yes --hardhat, forge build and forge test pass, rules files match', async () => {
  const r = must('node', [bin, erc20Dir, '--yes', '--hardhat']);
  assert.match(r.out, /Scaffolded gated-erc20/);
  for (const f of [
    'package.json', 'README.md', 'SECURITY.md', 'THREAT-MODEL.md', '.env.example', '.gitignore',
    '.github/workflows/ci.yml', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursor/rules/redbelly.mdc',
    '.github/copilot-instructions.md', 'contracts/foundry.toml', 'contracts/src/GatedERC20.sol',
    'contracts/script/Deploy.s.sol', 'contracts/script/Redbelly.sol', 'contracts/lib/receptor-mock',
    'hardhat/hardhat.config.ts', 'hardhat/src', 'hardhat/lib', 'web/package.json', 'web/src/app/page.tsx',
    'web/src/abi/GatedERC20.json', 'vendor/redbelly-chains/dist/esm/index.js', 'scripts/preflight.mjs',
  ]) assert.ok(existsSync(join(erc20Dir, f)), `${f} should exist`);

  // No placeholder or block tag survives rendering, and no key-shaped value exists anywhere we wrote.
  const walk = (d) => run('find', [d, '-type', 'f', '-not', '-path', '*/lib/*', '-not', '-path', '*/vendor/*', '-not', '-path', '*/node_modules/*']).stdout.split('\n').filter(Boolean);
  const { keccak256Hex } = await import(join(erc20Dir, 'vendor/redbelly-chains/dist/esm/index.js'));
  for (const f of walk(erc20Dir)) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/__[A-Z][A-Z0-9_]*__/.test(text), `${f} still has a placeholder`);
    assert.ok(!/\{\{[#/]/.test(text), `${f} still has a block tag`);
    // Pre-flight's rule, not a looser one: a 64-hex value passes only beside a keccak256("X") that
    // verifies. The vendored recipes state role hashes that way; a private key cannot.
    for (const line of text.split(/\r?\n/)) {
      const found = line.match(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g);
      if (!found) continue;
      const proven = new Set([...line.matchAll(/keccak256\(\\?"([A-Z][A-Z0-9_]*)\\?"\)/g)]
        .map((m) => keccak256Hex(new TextEncoder().encode(m[1])).toLowerCase()));
      assert.ok(found.every((v) => proven.has(v.toLowerCase())), `${f} has an unproven 64-hex value`);
    }
  }
  const readme = readFileSync(join(erc20Dir, 'README.md'), 'utf8');
  assert.ok(readme.startsWith('# gated-app\n\n<!-- for agents -->'), 'README starts with the for-agents block');
  const env = readFileSync(join(erc20Dir, '.env.example'), 'utf8');
  for (const line of env.split('\n').filter((l) => /^[A-Z_]+=/.test(l))) {
    // Public values only: an empty slot, the over-18 recipe's request id, the testnet chain id.
    assert.match(line, /=$|=18$|=153$/, `.env.example line has a value: ${line}`);
  }
  const toml = readFileSync(join(erc20Dir, 'contracts/foundry.toml'), 'utf8');
  assert.match(toml, /solc_version = "0\.8\.30"/);
  assert.match(toml, /evm_version = "prague"/);
  assert.match(toml, /\[profile\.testnet\][\s\S]*chain_id = 153/);
  assert.match(toml, /\[profile\.mainnet\][\s\S]*chain_id = 151/);

  must('npm', ['run', 'contracts:install'], { cwd: erc20Dir });
  must('forge', ['build'], { cwd: join(erc20Dir, 'contracts') });
  const t = must('forge', ['test'], { cwd: join(erc20Dir, 'contracts') });
  assert.match(t.out, /invariant_/, 'invariant tests ran');
  assert.match(t.out, /testFuzz_/, 'fuzz tests ran');
  assert.match(t.out, /AllInvalidStates|AllFiveStates/, 'five-state tests ran');
  assert.doesNotMatch(t.out, /FAIL/);
  must('forge', ['fmt', '--check', 'src', 'script', 'test'], { cwd: join(erc20Dir, 'contracts') });

  // Rules files: the vendored CLI and the source package agree that nothing drifted.
  must('node', ['vendor/redbelly-agent-rules/dist/esm/cli.js', '--check', '--out', '.', '--only', 'claude,agents,cursor,copilot,gemini'], { cwd: erc20Dir });
  const rulesCli = resolve(pkgRoot, '..', 'agent-rules', 'dist', 'esm', 'cli.js');
  must('node', [rulesCli, '--check', '--out', erc20Dir, '--only', 'claude,agents,cursor,copilot,gemini']);
});

// A deployments/local.json the way scripts/dev.mjs writes one, with made-up addresses. Present at
// build time on purpose: a production build must still carry nothing of the dev state panel.
const LOCAL_FIXTURE = {
  chainId: 31337,
  forkOf: 153,
  verifier: '0x00000000000000000000000000000000000000e1',
  contract: '0x00000000000000000000000000000000000000c0',
  requestId: 18,
  deployer: { index: 7, address: '0x7777777777777777777777777777777777777777' },
  wallets: ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction'].map((state, i) => ({ index: i + 2, state, address: `0x${String(i + 2).repeat(40)}`, note: `Anvil account ${i + 2}` })),
  startedAt: '2026-09-14T00:00:00.000Z',
};
const PANEL_MARKERS = ['rb-devstate', 'DevStatePanel', 'anvil-account-', 'anvil_impersonateAccount', 'parseLocalDeployment'];
function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

// The site quotes project 5's sources from cards/runs/, which nothing else compiles. This holds them
// to today's scaffold: a change to the contract kit or the deploy base that breaks the published
// bond fails here, not on a reader's machine. The files are removed again so later tests see the
// scaffold as it was written.
test('project 5: the published bond sources build, pass the linter and pass their tests on a fresh scaffold', () => {
  const card = resolve(pkgRoot, '..', '..', 'cards', 'runs', '2026-09-18', 'card-05');
  const contracts = join(erc20Dir, 'contracts');
  const placed = [
    ['TokenisedBond.sol', join(contracts, 'src', 'TokenisedBond.sol')],
    ['TokenisedBond.t.sol', join(contracts, 'test', 'TokenisedBond.t.sol')],
    ['MockStable.sol', join(contracts, 'test', 'mocks', 'MockStable.sol')],
    ['DeployBond.s.sol', join(contracts, 'script', 'DeployBond.s.sol')],
  ];
  try {
    for (const [name, dest] of placed) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(join(card, name)));
    }
    must('forge', ['fmt', '--check', 'src', 'script', 'test'], { cwd: contracts });
    must('forge', ['build'], { cwd: contracts });
    const t = must('forge', ['test', '--match-contract', 'TokenisedBond'], { cwd: contracts });
    assert.match(t.out, /17 tests passed, 0 failed/, t.out.slice(-600));
  } finally {
    for (const [, dest] of placed) rmSync(dest, { force: true });
  }
});

test('gated-erc20: the web app installs and builds, the shipped ABI matches the build, and a production build has no dev state panel', () => {
  must('npm', ['install', '--no-audit', '--no-fund'], { cwd: erc20Dir });
  must('node', ['scripts/abi-sync.mjs', '--check'], { cwd: erc20Dir });
  mkdirSync(join(erc20Dir, 'deployments'), { recursive: true });
  writeFileSync(join(erc20Dir, 'deployments', 'local.json'), JSON.stringify(LOCAL_FIXTURE, null, 2) + '\n');
  const b = must('npm', ['run', 'web:build'], { cwd: erc20Dir, env: { NEXT_TELEMETRY_DISABLED: '1' } });
  assert.match(b.out, /Compiled successfully/);
  assert.ok(existsSync(join(erc20Dir, 'web', '.next')), '.next output exists');
  // What ships: every static and server file of the build, and nothing in it names the panel.
  const shipped = ['static', 'server'].flatMap((d) => (existsSync(join(erc20Dir, 'web', '.next', d)) ? walkFiles(join(erc20Dir, 'web', '.next', d)) : []));
  assert.ok(shipped.length > 10, 'the build produced files');
  for (const file of shipped) {
    // Source maps carry the original text of every module, dead branches included; they are not what runs.
    if (!/\.(js|mjs|cjs|css|html|json|txt|rsc|body)$/.test(file) || file.endsWith('.map')) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of PANEL_MARKERS) assert.ok(!text.includes(marker), `${file.slice(erc20Dir.length)} carries "${marker}" in a production build`);
  }
  // The file was there, so the only thing keeping the panel out is the build-time gate.
  assert.ok(existsSync(join(erc20Dir, 'deployments', 'local.json')));
});

test('gated-erc20: hardhat compiles the same sources with the same pins', () => {
  const hh = must('npx', ['hardhat', 'compile'], { cwd: join(erc20Dir, 'hardhat') });
  assert.match(hh.out, /solc 0\.8\.30 \(evm target: prague\)|Nothing to compile/);
});

/** Chromium the way the site's quality scripts launch it: the pre-installed binary when PLAYWRIGHT_BROWSERS_PATH names one. */
function chromiumOptions() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const executablePath = process.env.CHROMIUM_PATH || (base && existsSync(join(base, 'chromium')) ? join(base, 'chromium') : undefined);
  return { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] };
}
/** Playwright from the site's install (the scaffolder has no dependencies of its own). */
function loadPlaywright() {
  for (const from of [import.meta.url, `file://${resolve(pkgRoot, '..', '..', 'site', 'package.json')}`]) {
    try {
      return createRequire(from)('playwright');
    } catch {
      /* try the next place */
    }
  }
  return null;
}
async function waitForHttp(url, ms) {
  const until = Date.now() + ms;
  let last = '';
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer in ${ms} ms (${last})`);
}
function startDev(cwd, args) {
  return new Promise((res) => {
    const child = spawn(process.execPath, ['scripts/dev.mjs', '--json', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    const io = { stdout: '', stderr: '', code: null };
    let settled = false;
    child.stdout.on('data', (d) => {
      io.stdout += d;
      const end = io.stdout.indexOf('\n}\n');
      if (!settled && end >= 0) {
        settled = true;
        res({ child, io, record: JSON.parse(io.stdout.slice(0, end + 3)) });
      }
    });
    child.stderr.on('data', (d) => (io.stderr += d));
    child.on('exit', (code) => {
      io.code = code;
      if (!settled) {
        settled = true;
        res({ child, io, record: null });
      }
    });
  });
}
const stopChild = (child) =>
  new Promise((res) => {
    if (child.exitCode !== null) return res(child.exitCode);
    child.on('exit', (code) => res(code));
    child.kill('SIGINT');
  });

test('gated-erc20: npm run dev with the web app: the dev state panel flips a wallet on 31337 without a reload, and never appears on 153', async (t) => {
  const playwright = loadPlaywright();
  if (!playwright) {
    t.skip('playwright is not installed here (npm ci in site/ provides it); the browser check did not run');
    return;
  }
  const anvilPort = await freePort();
  const webPort = await freePort();
  const dev = await startDev(erc20Dir, ['--no-fork', '--port', String(anvilPort), '--web-port', String(webPort)]);
  let browser;
  try {
    assert.ok(dev.record, `dev.mjs exited ${dev.io.code}:\n${dev.io.stderr.slice(-3000)}`);
    assert.equal(dev.record.chainId, 31337);
    await waitForHttp(`http://localhost:${webPort}/eligibility`, 180_000);
    browser = await playwright.chromium.launch(chromiumOptions());
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    let loads = 0;
    page.on('load', () => (loads += 1));
    await page.goto(`http://localhost:${webPort}/eligibility`, { waitUntil: 'load' });
    // The panel, with the five wallets in enum order.
    const panel = page.locator('.rb-devstate');
    await panel.waitFor({ timeout: 60_000 });
    const rows = panel.locator('tbody tr');
    assert.equal(await rows.count(), 5);
    assert.deepEqual(await rows.locator('td:nth-child(2)').allTextContents().then((t2) => t2.map((x) => x.split(' ')[0])), ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction']);
    // Connect wallet 3 (Valid) with no key: the gate shows Eligible.
    await rows.nth(1).getByRole('button', { name: 'Connect' }).click();
    await rows.nth(1).getByText('connected').waitFor({ timeout: 15_000 });
    await page.locator('.rb-elig-title', { hasText: /^Eligible$/ }).waitFor({ timeout: 30_000 });
    // Flip it to Expired: setStatus through the impersonated deployer, and the page re-renders without a reload.
    await panel.getByRole('button', { name: 'Expired', exact: true }).click();
    await panel.getByText(/is now Expired/).waitFor({ timeout: 15_000 });
    await page.locator('.rb-elig-title', { hasText: 'Not eligible for this action' }).waitFor({ timeout: 15_000 });
    assert.equal((await rows.nth(1).locator('td:nth-child(2)').textContent()).split(' ')[0], 'Expired');
    // And back to Valid.
    await panel.getByRole('button', { name: 'Valid', exact: true }).click();
    await page.locator('.rb-elig-title', { hasText: /^Eligible$/ }).waitFor({ timeout: 15_000 });
    // A revert shows the plain words, not a hex selector. The verifier's code is swapped for a stub
    // that answers false, with no new block (anvil_setCode mines nothing), so the page's cached read
    // still says Eligible and the Subscribe click reaches the node, which estimates against the stub
    // and reverts NotEligible. Then the real code goes back.
    const rpcUrl = `http://127.0.0.1:${anvilPort}`;
    const verifierCode = must('cast', ['code', dev.record.verifier, '--rpc-url', rpcUrl]).stdout.trim();
    must('cast', ['rpc', 'anvil_setCode', dev.record.verifier, '0x600060005260206000f3', '--rpc-url', rpcUrl]);
    await page.getByRole('button', { name: 'Subscribe' }).click();
    const words = page.locator('.rb-elig-muted', { hasText: 'The contract refused this wallet' });
    await words.waitFor({ timeout: 30_000 });
    assert.ok(!(await words.textContent()).includes('0x879342fb'), 'no selector in the words');
    assert.match(await words.textContent(), /Read more/);
    must('cast', ['rpc', 'anvil_setCode', dev.record.verifier, verifierCode, '--rpc-url', rpcUrl]);
    assert.equal(must('cast', ['call', dev.record.verifier, 'eligibilityStatus(address,uint64)(uint8)', dev.record.wallets[1].address, '18', '--rpc-url', rpcUrl]).stdout.trim(), '1', 'the real verifier is back');
    assert.equal(loads, 1, 'no reload happened');
    assert.deepEqual(pageErrors, []);
    // The chain agrees.
    const rpc = ['--rpc-url', `http://127.0.0.1:${anvilPort}`];
    assert.equal(must('cast', ['call', dev.record.verifier, 'eligibilityStatus(address,uint64)(uint8)', dev.record.wallets[1].address, '18', ...rpc]).stdout.trim(), '1');
    await page.close();
  } finally {
    if (browser) await browser.close();
    await stopChild(dev.child);
  }
  assert.equal(dev.io.code, 0, `dev.mjs should exit 0 after SIGINT:\n${dev.io.stderr.slice(-2000)}`);

  // Against 153, with the same deployments/local.json still on disk: no panel, whatever the file says.
  const nextBin = join(erc20Dir, 'node_modules', '.bin', 'next');
  const port153 = await freePort();
  const web153 = spawn(nextBin, ['dev', '--port', String(port153)], {
    cwd: join(erc20Dir, 'web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, NEXT_PUBLIC_CHAIN_ID: '153', NEXT_TELEMETRY_DISABLED: '1' },
  });
  let out153 = '';
  web153.stdout.on('data', (d) => (out153 += d));
  web153.stderr.on('data', (d) => (out153 += d));
  try {
    await waitForHttp(`http://localhost:${port153}/eligibility`, 180_000);
    browser = await playwright.chromium.launch(chromiumOptions());
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port153}/eligibility`, { waitUntil: 'load' });
    await page.locator('.card', { hasText: 'Connect a wallet' }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('.rb-devstate').count(), 0, 'the panel must not render against 153');
    assert.ok(!(await page.content()).includes('rb-devstate'));
    await page.close();
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-web153.pid, 'SIGTERM');
    } catch {
      web153.kill('SIGTERM');
    }
  }
});

test('scaffold empty with --yes, forge build and forge test pass, rules files match', () => {
  must('node', [bin, emptyDir, '--yes', '--template', 'empty', '--no-web', '--no-hardhat', '--pm', 'npm']);
  assert.ok(!existsSync(join(emptyDir, 'web')), 'no web app when --no-web');
  assert.ok(!existsSync(join(emptyDir, 'hardhat')), 'no hardhat when --no-hardhat');
  // npm run doctor works on the bare scaffold, before any install: the vendored preflight resolves its
  // vendored siblings through the links the scaffolder wrote, and vendor/ matches the version record.
  const pkg = JSON.parse(readFileSync(join(emptyDir, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.redbelly.vendor).sort(), ['redbelly-agent-rules', 'redbelly-chains', 'redbelly-preflight']);
  const doctor = run('npm', ['run', 'doctor', '--silent', '--', '--json'], { cwd: emptyDir });
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.scaffold, true);
  assert.equal(report.checks.find((c) => c.id === 'vendor').status, 'pass', report.checks.find((c) => c.id === 'vendor').reason);
  assert.equal(report.checks.find((c) => c.id === 'foundry-exit-code').status, 'pass', 'the forge on PATH hands back exit codes; the tests below trust them');
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => c.status === 'fail')));
  assert.equal(doctor.code, 0);
  must('npm', ['run', 'contracts:install'], { cwd: emptyDir });
  must('forge', ['build'], { cwd: join(emptyDir, 'contracts') });
  const t = must('forge', ['test'], { cwd: join(emptyDir, 'contracts') });
  assert.match(t.out, /AllInvalidStates|AllFiveStates/);
  assert.match(t.out, /invariant_/);
  assert.doesNotMatch(t.out, /FAIL/);
  must('node', ['vendor/redbelly-agent-rules/dist/esm/cli.js', '--check', '--out', '.', '--only', 'claude,agents,cursor,copilot,gemini'], { cwd: emptyDir });
});

test('deploy script refuses a simulated mainnet with an EOA admin and accepts one with a Safe 1.4.1 (threshold 2)', async () => {
  const contracts = join(erc20Dir, 'contracts');
  const chains = await import(resolve(erc20Dir, 'vendor/redbelly-chains/dist/esm/index.js'));
  const A = chains.addresses.mainnet;
  const anvil = await startAnvil(['--chain-id', '151']);
  try {
    const rpc = ['--rpc-url', anvil.url];
    // anvil's default unlocked accounts; the keys never leave anvil.
    const accounts = JSON.parse(must('cast', ['rpc', 'eth_accounts', ...rpc]).stdout);
    const [deployer, o1, o2, o3] = accounts;
    const artifact = (name) => JSON.parse(readFileSync(join(contracts, 'out', 'RedbellyMocks.sol', `${name}.json`), 'utf8')).deployedBytecode.object;

    // The chain needs a bootstrap registry that resolves "permission". Plant the test mocks
    // at the real registry address so the script's identity check runs as it would on 151.
    const permission = '0x00000000000000000000000000000000000000ff';
    must('cast', ['rpc', 'anvil_setCode', A.bootstrapRegistry.address, artifact('BootstrapRegistryMock'), ...rpc]);
    must('cast', ['rpc', 'anvil_setCode', permission, artifact('PermissionMock'), ...rpc]);
    must('cast', ['send', '--unlocked', '--from', deployer, A.bootstrapRegistry.address, 'set(string,address)', 'permission', permission, ...rpc]);
    must('cast', ['send', '--unlocked', '--from', deployer, permission, 'setAllowed(address,bool)', deployer, 'true', ...rpc]);

    const script = ['script', 'script/Deploy.s.sol', ...rpc, '--sender', deployer, '--unlocked', '--broadcast'];
    const baseEnv = { RECORD_DEPLOYMENT: 'false', REQUEST_ID: '1' };

    // A verifier for the mainnet case: the script refuses to deploy a mock on 151 and
    // ReceptorMock's own constructor refuses chain 151 too, so use what production would:
    // an Iden3VerifierAdapter over a (fake) ZKPVerifier.
    const create = (path, ctorArgs = []) => {
      const c = must('forge', ['create', path, ...rpc, '--unlocked', '--from', deployer, '--broadcast', ...(ctorArgs.length ? ['--constructor-args', ...ctorArgs] : [])], { cwd: contracts });
      return c.stdout.match(/Deployed to: (0x[0-9a-fA-F]{40})/)[1];
    };
    const mockOn151 = run('forge', ['create', 'lib/receptor-mock/src/ReceptorMock.sol:ReceptorMock', ...rpc, '--unlocked', '--from', deployer, '--broadcast'], { cwd: contracts });
    assert.notEqual(mockOn151.code, 0, 'ReceptorMock must refuse to deploy on chain 151');
    const fakeIden3 = create('lib/receptor-mock/test/fakes/FakeIden3Verifiers.sol:FakeIden3V1');
    const verifier = create('lib/receptor-mock/src/adapters/Iden3VerifierAdapter.sol:Iden3VerifierAdapter', [fakeIden3, '0']);

    // 1. EOA admin: refused.
    let r = run('forge', script, { cwd: contracts, env: { ...baseEnv, ADMIN_SAFE: o1, VERIFIER: verifier } });
    assert.notEqual(r.code, 0, 'EOA admin must be refused on chain 151');
    assert.match(r.out, /ADMIN_SAFE is not a contract/);

    // 2. No admin at all: refused.
    r = run('forge', script, { cwd: contracts, env: { ...baseEnv, VERIFIER: verifier } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /ADMIN_SAFE is not set/);

    // 3. A real Safe 1.4.1. Plant the canonical runtime code (fixtures read with `cast code`
    //    from 151 and 153) at the canonical addresses, then create a proxy through the factory.
    const hex = (f) => readFileSync(join(fixtures, f), 'utf8').trim();
    must('cast', ['rpc', 'anvil_setCode', A.safeSingleton.address, hex('Safe.runtime.hex'), ...rpc]);
    must('cast', ['rpc', 'anvil_setCode', A.safeProxyFactory.address, hex('SafeProxyFactory.runtime.hex'), ...rpc]);
    must('cast', ['rpc', 'anvil_setCode', A.safeFallbackHandler.address, hex('CompatibilityFallbackHandler.runtime.hex'), ...rpc]);
    const version = must('cast', ['call', A.safeSingleton.address, 'VERSION()(string)', ...rpc]).stdout.trim();
    assert.equal(version, '"1.4.1"');
    const setupData = must('cast', ['calldata', 'setup(address[],uint256,address,bytes,address,address,uint256,address)',
      `[${o1},${o2},${o3}]`, '2', '0x0000000000000000000000000000000000000000', '0x', A.safeFallbackHandler.address,
      '0x0000000000000000000000000000000000000000', '0', '0x0000000000000000000000000000000000000000']).stdout.trim();
    const sig = 'createProxyWithNonce(address,bytes,uint256)(address)';
    const safe = must('cast', ['call', A.safeProxyFactory.address, sig, A.safeSingleton.address, setupData, '1', '--from', deployer, ...rpc]).stdout.trim();
    must('cast', ['send', '--unlocked', '--from', deployer, A.safeProxyFactory.address, sig, A.safeSingleton.address, setupData, '1', ...rpc]);
    assert.equal(must('cast', ['call', safe, 'getThreshold()(uint256)', ...rpc]).stdout.trim(), '2');
    assert.equal(must('cast', ['call', safe, 'VERSION()(string)', ...rpc]).stdout.trim(), '"1.4.1"');

    // 3a. Safe admin but a threshold of 1 would be refused: prove the check reads the threshold.
    const setupOne = setupData.replace(/^(0x[0-9a-f]{8}[0-9a-f]{64})[0-9a-f]{64}/, (m, head) => head + '1'.padStart(64, '0'));
    const safeOne = must('cast', ['call', A.safeProxyFactory.address, sig, A.safeSingleton.address, setupOne, '2', '--from', deployer, ...rpc]).stdout.trim();
    must('cast', ['send', '--unlocked', '--from', deployer, A.safeProxyFactory.address, sig, A.safeSingleton.address, setupOne, '2', ...rpc]);
    r = run('forge', script, { cwd: contracts, env: { ...baseEnv, ADMIN_SAFE: safeOne, VERIFIER: verifier } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /threshold must be at least 2/);

    // 3b. Threshold 2 and a verified deployer, but no ship report dated today: refused. This is the
    //     wave 8 gate; a dry run (no --broadcast) says so and continues.
    r = run('forge', script, { cwd: contracts, env: { ...baseEnv, ADMIN_SAFE: safe, VERIFIER: verifier } });
    assert.notEqual(r.code, 0, 'a broadcast on 151 without today\'s ship report must be refused');
    assert.match(r.out, /no ship report dated today for chain 151: run redbelly ship first/);
    const dry = run('forge', script.filter((a) => a !== '--broadcast'), { cwd: contracts, env: { ...baseEnv, ADMIN_SAFE: safe, VERIFIER: verifier } });
    assert.equal(dry.code, 0, `a dry run without the report continues:\n${dry.out.slice(-2000)}`);
    assert.match(dry.out, /--broadcast would refuse\. Run: redbelly ship/);

    // 3c. redbelly ship writes the report: pre-flight with a keystore's address, the Slither sidecar,
    //     the five-state tests and the gas report, all on this chain 151 with the impersonated Safe.
    //     The keystore is one cast creates under a temp HOME; the deployer is that address, allowed
    //     and funded here, never Anvil's accounts 0 or 1.
    const home = mkdtempSync(join(tmp, 'ship-home-'));
    mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
    writeFileSync(join(home, 'password'), 'scaffold-ship-test\n');
    const shipEnv = { ...process.env, HOME: home };
    must('cast', ['wallet', 'new', join(home, '.foundry', 'keystores'), 'shipper', '--unsafe-password', 'scaffold-ship-test'], { env: shipEnv });
    const shipper = must('cast', ['wallet', 'address', '--account', 'shipper', '--password-file', join(home, 'password')], { env: shipEnv }).stdout.match(/0x[0-9a-fA-F]{40}/)[0];
    must('cast', ['send', '--unlocked', '--from', deployer, permission, 'setAllowed(address,bool)', shipper, 'true', ...rpc]);
    must('cast', ['rpc', 'anvil_setBalance', shipper, '0x' + (10n ** 22n).toString(16), ...rpc]);
    must('cast', ['rpc', 'anvil_setNextBlockBaseFeePerGas', '0x' + (202_118n * 10n ** 9n).toString(16), ...rpc]);
    must('cast', ['rpc', 'evm_mine', ...rpc]);
    // The price feed the gas report and the balance check read, planted the way pre-flight's tests do.
    const { priceFeedMock } = await import(resolve(pkgRoot, '..', 'preflight', 'test', 'mocks.mjs'));
    must('cast', ['rpc', 'anvil_setCode', A.pricefeed.address, priceFeedMock(2431), ...rpc]);
    must('cast', ['send', '--unlocked', '--from', deployer, A.bootstrapRegistry.address, 'set(string,address)', 'pricefeed', A.pricefeed.address, ...rpc]);
    // A Slither report and its sources hash, as npm run lint:slither writes them, and a git history for the secrets scan.
    const { hashSources } = await import(resolve(pkgRoot, '..', 'preflight', 'dist', 'index.js'));
    mkdirSync(join(contracts, 'reports'), { recursive: true });
    writeFileSync(join(contracts, 'reports', 'slither.json'), '{"success":true,"results":{"detectors":[]}}\n');
    writeFileSync(join(contracts, 'reports', 'slither.sources.sha256'), hashSources(join(contracts, 'src')) + '\n');
    must('git', ['init', '-q', '-b', 'main'], { cwd: erc20Dir });
    must('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'add', '-A'], { cwd: erc20Dir });
    must('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'scaffold'], { cwd: erc20Dir });
    const ship = run('node', ['vendor/redbelly-preflight/dist/redbelly.js', 'ship', '--project', 'contracts', '--chain', '151', '--account', 'shipper', '--password-file', join(home, 'password'), '--admin', safe, '--verifier', verifier, '--rpc', anvil.url, '--json'], { cwd: erc20Dir, env: shipEnv });
    assert.equal(ship.code, 0, `redbelly ship should pass every check:\n${ship.out.slice(-4000)}`);
    const shipReport = JSON.parse(ship.stdout);
    assert.equal(shipReport.ok, true);
    assert.equal(shipReport.tests.fiveState, true);
    assert.equal(shipReport.admin.threshold, 2);
    assert.equal(shipReport.gas.deployment.contract, 'GatedERC20');
    const today = new Date().toISOString().slice(0, 10);
    // realpath both sides: on macOS the temp folder is a symlink (/var -> /private/var).
    assert.equal(realpathSync(shipReport.written), realpathSync(join(contracts, 'deployments', `ship-151-${today}.md`)));
    assert.ok(existsSync(shipReport.written));
    assert.match(readFileSync(shipReport.written, 'utf8'), /^<!-- redbelly-ship chain=151 date=\d{4}-\d{2}-\d{2} ok=true /);

    // 3d. With today's report present the same broadcast is accepted, the Safe holds the admin role,
    //     and the deployment record carries the constructor arguments the verify command needs.
    r = run('forge', script, { cwd: contracts, env: { ...baseEnv, RECORD_DEPLOYMENT: 'true', ADMIN_SAFE: safe, VERIFIER: verifier } });
    assert.equal(r.code, 0, `Safe admin should be accepted:\n${r.out.slice(-3000)}`);
    assert.match(r.out, /ship report: deployments\/ship-151-/);
    const record = JSON.parse(readFileSync(join(contracts, 'deployments', '151-GatedERC20.json'), 'utf8'));
    assert.equal(record.contractName, 'GatedERC20');
    assert.equal(record.constructorSignature, 'constructor(string,string,(address,address,address,address),address,uint64,uint256)');
    assert.match(record.constructorArgs, /^0x[0-9a-f]+$/);
    assert.equal(record.verifier.toLowerCase(), verifier.toLowerCase());
    assert.equal(record.requestId, 1);
    // Ship again: the contract section now names the address, the arguments and the verify command.
    const again = run('node', ['vendor/redbelly-preflight/dist/redbelly.js', 'ship', '--project', 'contracts', '--chain', '151', '--account', 'shipper', '--password-file', join(home, 'password'), '--admin', safe, '--verifier', verifier, '--rpc', anvil.url, '--json'], { cwd: erc20Dir, env: shipEnv });
    assert.equal(again.code, 0, again.out.slice(-2000));
    const filled = JSON.parse(again.stdout);
    assert.equal(filled.contracts.length, 1);
    assert.equal(filled.contracts[0].address, record.contract);
    assert.match(filled.contracts[0].verifyCommand, new RegExp(`--constructor-args ${record.constructorArgs} --watch$`));
    assert.match(r.out, /ADMIN_SAFE is a Safe 1\.4\.1 with threshold 2/);
    assert.match(r.out, /permission\.isAllowed\(deployer\): true/);
    const token = r.out.match(/GatedERC20: (0x[0-9a-fA-F]{40})/)[1];
    const adminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
    assert.equal(must('cast', ['call', token, 'hasRole(bytes32,address)(bool)', adminRole, safe, ...rpc]).stdout.trim(), 'true');
    assert.equal(must('cast', ['call', token, 'hasRole(bytes32,address)(bool)', adminRole, deployer, ...rpc]).stdout.trim(), 'false');

    // 4. Same Safe, but the deployer is not verified: refused.
    must('cast', ['send', '--unlocked', '--from', deployer, permission, 'setAllowed(address,bool)', deployer, 'false', ...rpc]);
    r = run('forge', script, { cwd: contracts, env: { ...baseEnv, ADMIN_SAFE: safe, VERIFIER: verifier } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /deployer fails permission\.isAllowed/);
    must('cast', ['send', '--unlocked', '--from', deployer, permission, 'setAllowed(address,bool)', deployer, 'true', ...rpc]);

    // 5. The preflight script sees the same things, before anything is signed.
    const pre = (env) => run('node', ['scripts/preflight.mjs', '--chain', '151', '--rpc', anvil.url], { cwd: erc20Dir, env });
    let p = pre({ DEPLOYER: deployer, ADMIN_SAFE: o1, VERIFIER: verifier });
    assert.equal(p.code, 1);
    assert.match(p.out, /FAIL ADMIN_SAFE is a contract/);
    p = pre({ DEPLOYER: deployer, ADMIN_SAFE: safe, VERIFIER: verifier });
    assert.equal(p.code, 0, p.out);
    assert.match(p.out, /ok +ADMIN_SAFE threshold >= 2/);
    assert.match(p.out, /Pre-flight clear/);
  } finally {
    anvil.child.kill();
  }
});
