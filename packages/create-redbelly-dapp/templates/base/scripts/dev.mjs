#!/usr/bin/env node
// The local loop in one command (PLAN.md 18.1). Forks testnet on Anvil as chain 31337, deploys a
// ReceptorMock and this project's contract, seeds Anvil accounts 2 to 6 into the five credential
// states, starts the web app with the dev state panel, and prints a table of wallet, state and the
// impersonation command beside each. Ctrl-C stops Anvil and the web app together.
//
//   npm run dev                       fork 153, Anvil on 8545, web app on 3000
//   npm run dev -- --no-web           Anvil and the seeded contract only
//   npm run dev -- --no-fork          plain Anvil, no upstream (offline; the permission gate is mocked)
//   npm run dev -- --chain 151        fork mainnet instead; read-only, it warns
//   npm run dev -- --request-id 708   bind the AU wholesale investor recipe instead of over-18 (18;
//                                     a REQUEST_ID in .env is the default when the flag is absent)
//   npm run dev -- --json             the table as JSON on stdout and nothing else there (for agents)
//   --port 8545  --web-port 3000      where Anvil and the web app listen
//
// Exit codes: 0 running (and 0 after Ctrl-C), 1 a step failed (which one and why on stderr),
// 2 already running, 3 forge or anvil missing.
//
// Keys: none. Anvil's own accounts sign locally; this script never prints or writes a key, and
// deployments/local.json records account indices, never keys. Accounts 0 and 1 are never used for
// anything, because they pass permission.isAllowed on the real networks (RESEARCH.md question 30).
// The real networks are only read (the fork fetches state); every transaction lands on Anvil.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addresses, chainById, checksumAddress, createRpc, decodeWords, encodeAddress, encodeCall, encodeUint256, functionSelector } from '@gatedpath/chains';

export const LOCAL_CHAIN_ID = 31337;
/** The five states, in EligibilityStatus enum order (@gatedpath/receptor-mock). wallets[i] gets STATES[i]. */
export const STATES = ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction'];
/** Anvil account indices for the five wallets. Never 0 or 1. */
export const WALLET_INDICES = [2, 3, 4, 5, 6];
/** The account that deploys and holds the admin roles; the dev state panel impersonates it. */
export const DEPLOYER_INDEX = 7;
export const EXIT = { RUNNING: 0, FAILED: 1, ALREADY_RUNNING: 2, TOOLS_MISSING: 3 };

const STATE_NOTES = {
  NeverIssued: 'no credential; every gated call reverts NotEligible',
  Valid: 'passes the gate; the gated action succeeds',
  Expired: 'credential past its window; reverts NotEligible',
  Revoked: 'issuer revoked the credential; reverts NotEligible',
  WrongJurisdiction: "credential doesn't satisfy the query; reverts NotEligible",
};

export class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = { chain: 153, port: 8545, webPort: 3000, web: true, fork: true, requestId: 18, requestIdSource: 'default', json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) throw new UsageError(`${flag} needs a value`);
      i += 1;
      return v;
    };
    const whole = (v) => {
      if (!/^\d+$/.test(v)) throw new UsageError(`${flag} must be a whole number, got "${v}"`);
      return Number(v);
    };
    if (flag === '--help' || flag === '-h') opts.help = true;
    else if (flag === '--json') opts.json = true;
    else if (flag === '--no-web') opts.web = false;
    else if (flag === '--no-fork') opts.fork = false;
    else if (flag === '--chain') {
      const v = value();
      if (v !== '153' && v !== '151') throw new UsageError(`--chain must be 153 (testnet) or 151 (mainnet), got "${v}"`);
      opts.chain = Number(v);
    } else if (flag === '--port') opts.port = whole(value());
    else if (flag === '--web-port') opts.webPort = whole(value());
    else if (flag === '--request-id') {
      opts.requestId = whole(value());
      opts.requestIdSource = 'flag';
    }
    else throw new UsageError(`unknown option ${arg}`);
  }
  return opts;
}

export const USAGE = `usage: npm run dev -- [--chain 153|151] [--port 8545] [--web-port 3000] [--no-web] [--no-fork] [--request-id 18] [--json]
Forks the chosen network on Anvil as chain ${LOCAL_CHAIN_ID}, deploys a ReceptorMock and the contract, seeds Anvil accounts ${WALLET_INDICES[0]} to ${WALLET_INDICES.at(-1)}
into the five credential states, starts the web app and writes deployments/local.json. Ctrl-C stops everything.`;

/** The note recorded beside each wallet: which Anvil account it is and what its state means. */
export function noteFor(index, state) {
  return `Anvil account ${index}; ${STATE_NOTES[state]}`;
}

/** The table `npm run dev` prints (and `--json` replaces). Pure, so the test can pin it. */
export function renderTable(deployment, { rpcUrl, webUrl, contractName, forkBlock }) {
  const impersonate = (address) => `cast rpc anvil_impersonateAccount ${address} --rpc-url ${rpcUrl}`;
  const lines = [];
  const where = deployment.forkOf ? `fork of ${deployment.forkOf}${forkBlock ? ` at block ${forkBlock}` : ''}` : 'no fork';
  lines.push(`Local loop ready: Anvil chain ${deployment.chainId} (${where}) at ${rpcUrl}`);
  lines.push(`${contractName} ${deployment.contract}   verifier (ReceptorMock) ${deployment.verifier}   request id ${deployment.requestId}`);
  lines.push(`deployer and admin: Anvil account ${deployment.deployer.index} ${deployment.deployer.address} (accounts 0 and 1 are never used)`);
  lines.push('');
  const rows = deployment.wallets.map((w) => [String(w.index), w.state, w.address, impersonate(w.address)]);
  const head = ['Wallet', 'State', 'Address', 'Impersonate (cast)'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ');
  lines.push(line(head));
  lines.push(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) lines.push(line(r));
  lines.push('');
  lines.push(`States are per request id ${deployment.requestId}; change one with: cast send ${deployment.verifier} "setStatus(address,uint64,uint8)" <wallet> ${deployment.requestId} <0-4> --unlocked --from ${deployment.deployer.address} --rpc-url ${rpcUrl}`);
  lines.push(`Record: deployments/local.json (account indices, never a key).${webUrl ? ` Web app with the dev state panel: ${webUrl}` : ''}`);
  lines.push('Ctrl-C stops Anvil' + (webUrl ? ' and the web app' : '') + '.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The run. Everything below talks to a spawned Anvil and the local file system only.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const contracts = join(root, 'contracts');
const deploymentsDir = join(root, 'deployments');
const lockPath = join(deploymentsDir, 'local.lock');
const recordPath = join(deploymentsDir, 'local.json');

const children = [];
let stopping = false;

function log(line) {
  process.stderr.write(`[dev] ${line}\n`);
}
function fail(code, message) {
  process.stderr.write(`[dev] ${message}\n`);
  stop(code);
}
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
  try {
    if (existsSync(lockPath) && JSON.parse(readFileSync(lockPath, 'utf8')).pid === process.pid) rmSync(lockPath);
  } catch {
    /* nothing to remove */
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
    process.exit(code);
  }, 500).unref();
}

function which(tool) {
  const r = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').split('\n')[0] : null;
}
function portFree(port) {
  return new Promise((res) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      res(false);
    });
    socket.once('error', () => res(true));
  });
}
function lockHolder() {
  if (!existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    process.kill(lock.pid, 0);
    return lock;
  } catch (error) {
    if (error && error.code === 'EPERM') return JSON.parse(readFileSync(lockPath, 'utf8'));
    rmSync(lockPath, { force: true }); // stale: the process is gone
    return null;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** KEY=value lines of a dotenv file, quotes stripped; an absent file is an empty object. */
export function readDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`[dev] ${error.message}\n${USAGE}\n`);
      process.exit(EXIT.FAILED);
    }
    throw error;
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const t0 = Date.now();
  const elapsed = (since) => `${((Date.now() - since) / 1000).toFixed(1)} s`;
  // Which request id the contract is bound to: --request-id, else REQUEST_ID in .env, else the
  // deploy script's own default (18 on a fresh scaffold, the over-18 recipe). A project that has
  // moved to another recipe in its script (card 1 moves to 708) therefore gets its own gate with
  // no flag, and the id is read back from the contract after the deploy either way.
  if (opts.requestIdSource === 'default') {
    const fromEnv = readDotEnv(join(root, '.env')).REQUEST_ID;
    if (fromEnv && /^\d+$/.test(fromEnv)) {
      opts.requestId = Number(fromEnv);
      opts.requestIdSource = '.env';
      log(`request id ${opts.requestId} from .env (pass --request-id to override)`);
    }
  }

  // 1. Tools and installs, before anything starts.
  const missing = ['forge', 'anvil'].filter((t) => !which(t));
  if (missing.length) {
    process.stderr.write(
      `[dev] ${missing.join(' and ')} not found on PATH; forge and anvil are needed. Run npm run doctor for every check.\n` +
        `      Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup\n` +
        `      Where foundryup is blocked, the npm packages carry the same binaries: npm install -g @foundry-rs/forge @foundry-rs/anvil @foundry-rs/cast\n` +
        `      Then check every tool at once: npm run doctor\n`,
    );
    process.exit(EXIT.TOOLS_MISSING);
  }
  if (!existsSync(join(contracts, 'lib', 'forge-std', 'src', 'Test.sol')) || !existsSync(join(contracts, 'node_modules', '@openzeppelin', 'contracts', 'package.json'))) {
    process.stderr.write('[dev] contracts are not installed: run npm install && npm run contracts:install first.\n');
    process.exit(EXIT.FAILED);
  }
  const webDir = join(root, 'web');
  const hasWeb = existsSync(join(webDir, 'package.json'));
  const nextBin = [join(root, 'node_modules', '.bin', 'next'), join(webDir, 'node_modules', '.bin', 'next')].find((p) => existsSync(p));
  const wantWeb = opts.web && hasWeb;
  if (wantWeb && !nextBin) {
    process.stderr.write('[dev] the web app is not installed (no next binary): run npm install first, or pass --no-web.\n');
    process.exit(EXIT.FAILED);
  }

  // 2. One at a time.
  const holder = lockHolder();
  if (holder) {
    process.stderr.write(`[dev] npm run dev is already running (pid ${holder.pid}, since ${holder.startedAt}, Anvil on port ${holder.port}). Stop it with Ctrl-C there, or kill ${holder.pid}.\n`);
    process.exit(EXIT.ALREADY_RUNNING);
  }
  if (!(await portFree(opts.port))) {
    process.stderr.write(`[dev] port ${opts.port} is in use (another anvil?). Pass --port <n> or stop it.\n`);
    process.exit(EXIT.FAILED);
  }
  if (wantWeb && !(await portFree(opts.webPort))) {
    process.stderr.write(`[dev] web port ${opts.webPort} is in use. Pass --web-port <n> or stop what listens there.\n`);
    process.exit(EXIT.FAILED);
  }
  mkdirSync(deploymentsDir, { recursive: true });
  const startedAt = new Date().toISOString();
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: opts.port, startedAt }) + '\n');
  process.on('SIGINT', () => stop(EXIT.RUNNING));
  process.on('SIGTERM', () => stop(EXIT.RUNNING));
  process.on('SIGHUP', () => stop(EXIT.RUNNING));

  // 3. Anvil, as chain 31337 whatever it forks, so nothing local can be mistaken for 153 or 151.
  const upstream = chainById(opts.chain);
  const forkUrl = upstream.rpcUrls.default.http[0];
  const rpcUrl = `http://127.0.0.1:${opts.port}`;
  if (opts.fork && opts.chain === 151) {
    log('--chain 151: forking mainnet. The fork only reads mainnet state; nothing is signed against 151 and every transaction lands on Anvil.');
  }
  const anvilArgs = ['--port', String(opts.port), '--chain-id', String(LOCAL_CHAIN_ID), '--silent', ...(opts.fork ? ['--fork-url', forkUrl] : [])];
  const tAnvil = Date.now();
  log(`anvil ${anvilArgs.join(' ')}`);
  const anvil = spawn('anvil', anvilArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  children.push(anvil);
  let anvilErr = '';
  anvil.stderr.on('data', (d) => (anvilErr += d));
  anvil.stdout.on('data', () => {}); // --silent prints nothing, and its account banner (with keys) is never relayed
  let anvilExited = false;
  anvil.on('exit', (code) => {
    anvilExited = true;
    if (!stopping) fail(EXIT.FAILED, `anvil exited with code ${code}${anvilErr ? `:\n${anvilErr.trim()}` : ''}`);
  });
  const rpc = createRpc(rpcUrl);
  let ready = false;
  for (let i = 0; i < 300 && !ready && !anvilExited; i += 1) {
    try {
      ready = Number(BigInt(await rpc('eth_chainId'))) === LOCAL_CHAIN_ID;
    } catch {
      await sleep(200);
    }
  }
  if (!ready) return fail(EXIT.FAILED, `anvil did not answer on ${rpcUrl} within 60 s${opts.fork ? ` (is ${forkUrl} reachable?)` : ''}${anvilErr ? `:\n${anvilErr.trim()}` : ''}`);
  const forkBlock = opts.fork ? Number(BigInt(await rpc('eth_blockNumber'))) : null;
  log(`anvil ready${opts.fork ? `, forked ${opts.chain} at block ${forkBlock}` : ''} (${elapsed(tAnvil)})`);

  const accounts = await rpc('eth_accounts');
  if (!Array.isArray(accounts) || accounts.length < DEPLOYER_INDEX + 1) return fail(EXIT.FAILED, `anvil reported ${accounts?.length ?? 0} accounts; ${DEPLOYER_INDEX + 1} are needed`);
  const deployer = checksumAddress(accounts[DEPLOYER_INDEX]);
  const wallets = WALLET_INDICES.map((i) => checksumAddress(accounts[i]));

  async function send(from, to, data) {
    const hash = await rpc('eth_sendTransaction', [{ from, to, data }]);
    for (let i = 0; i < 100; i += 1) {
      const receipt = await rpc('eth_getTransactionReceipt', [hash]);
      if (receipt) {
        if (receipt.status !== '0x1') throw new Error(`transaction ${hash} to ${to} reverted`);
        return receipt;
      }
      await sleep(50);
    }
    throw new Error(`no receipt for ${hash}`);
  }
  const call = async (to, data) => decodeWords(await rpc('eth_call', [{ to, data }, 'latest']));

  // 4. Compile once, so the mocks' artifacts exist.
  const tBuild = Date.now();
  const build = spawnSync('forge', ['build'], { cwd: contracts, encoding: 'utf8' });
  if (build.status !== 0) return fail(EXIT.FAILED, `forge build failed:\n${(build.stdout + build.stderr).trim().slice(-3000)}`);
  log(`forge build (${elapsed(tBuild)})`);
  const artifact = (file, name) => {
    const path = join(contracts, 'out', file, `${name}.json`);
    if (!existsSync(path)) throw new Error(`${path} missing after forge build`);
    return JSON.parse(readFileSync(path, 'utf8'));
  };

  // 5. The permission gate. The forked network's permission contract says false for Anvil's
  //    accounts 2 to 9 (and true for 0 and 1, which is why those are never used). The five wallets
  //    have to pass it for the web app and the deploy pre-flight to treat them as real wallets,
  //    so the gate is replaced on the local chain with the test mock and the six accounts are
  //    allowed. This is local Anvil state only; the real contract is untouched.
  const tGate = Date.now();
  const net = addresses[opts.chain === 151 ? 'mainnet' : 'testnet'];
  const registry = net.bootstrapRegistry.address;
  let permission = net.permission.address;
  if (opts.fork) {
    try {
      const sel = functionSelector('getContractAddress(string)');
      const name = Buffer.from('permission', 'utf8');
      const nameHex = name.toString('hex').padEnd(64, '0');
      const [word] = await call(registry, encodeCall(sel, encodeUint256(32n), encodeUint256(BigInt(name.length)), nameHex));
      permission = checksumAddress('0x' + word.toString(16).padStart(40, '0'));
    } catch {
      /* the registry did not answer; the recorded address stands */
    }
  } else {
    const registryMock = artifact('RedbellyMocks.sol', 'BootstrapRegistryMock').deployedBytecode.object;
    await rpc('anvil_setCode', [registry, registryMock]);
    const name = Buffer.from('permission', 'utf8');
    const nameHex = name.toString('hex').padEnd(64, '0');
    await send(deployer, registry, encodeCall(functionSelector('set(string,address)'), encodeUint256(64n), encodeAddress(permission), encodeUint256(BigInt(name.length)), nameHex));
  }
  const permissionMock = artifact('RedbellyMocks.sol', 'PermissionMock').deployedBytecode.object;
  await rpc('anvil_setCode', [permission, permissionMock]);
  const setAllowed = functionSelector('setAllowed(address,bool)');
  for (const a of [deployer, ...wallets]) await send(deployer, permission, encodeCall(setAllowed, encodeAddress(a), encodeUint256(1n)));
  log(`permission gate mocked at ${permission}; deployer and the five wallets allowed (${elapsed(tGate)})`);

  // 6. Deploy through the project's own script, as the deployer, with a ReceptorMock as verifier.
  //    VERIFIER and ADMIN_SAFE are cleared on purpose: a .env pointing at a real verifier must not
  //    leak into the local loop, and the deployer holds the admin roles here.
  const tDeploy = Date.now();
  const script = spawnSync('forge', ['script', 'script/Deploy.s.sol', '--rpc-url', rpcUrl, '--sender', deployer, '--unlocked', '--broadcast'], {
    cwd: contracts,
    encoding: 'utf8',
    env: { ...process.env, VERIFIER: '', ADMIN_SAFE: '', ...(opts.requestIdSource === 'default' ? { REQUEST_ID: '' } : { REQUEST_ID: String(opts.requestId) }), RECORD_DEPLOYMENT: 'false' },
  });
  const scriptOut = (script.stdout || '') + (script.stderr || '');
  const verifierMatch = scriptOut.match(/\bverifier: (0x[0-9a-fA-F]{40})/);
  const contractMatch = [...scriptOut.matchAll(/^\s*([A-Za-z0-9_]+): (0x[0-9a-fA-F]{40})\s*$/gm)].find((m) => m[1] !== 'verifier' && m[1] !== 'deployer' && m[1] !== 'admin');
  if (script.status !== 0 || !verifierMatch || !contractMatch) {
    return fail(EXIT.FAILED, `deploy failed (forge script script/Deploy.s.sol):\n${scriptOut.trim().slice(-3000)}`);
  }
  const verifier = checksumAddress(verifierMatch[1]);
  const contractName = contractMatch[1];
  const contract = checksumAddress(contractMatch[2]);
  // The id the contract is actually bound to (Gated.requestId()), whatever asked for it.
  const [bound] = await call(contract, functionSelector('requestId()'));
  if (opts.requestIdSource !== 'default' && Number(bound) !== opts.requestId) {
    return fail(EXIT.FAILED, `the deploy bound request id ${bound}, not the ${opts.requestId} asked for by ${opts.requestIdSource}; does script/Deploy.s.sol read REQUEST_ID?`);
  }
  opts.requestId = Number(bound);
  log(`deployed ${contractName} ${contract} with ReceptorMock ${verifier}, request id ${opts.requestId}${opts.requestIdSource === 'default' ? ' (the deploy script\'s default)' : ''} (${elapsed(tDeploy)})`);

  // 7. Seed the five states, in enum order, and open what the template gates if it has a switch.
  const tSeed = Date.now();
  const abi = artifact(`${contractName}.sol`, contractName).abi ?? [];
  if (abi.some((f) => f.type === 'function' && f.name === 'setSubscriptionsOpen')) {
    await send(deployer, contract, encodeCall(functionSelector('setSubscriptionsOpen(bool)'), encodeUint256(1n)));
    log('subscriptions opened');
  }
  const setStatus = functionSelector('setStatus(address,uint64,uint8)');
  const eligibilityStatus = functionSelector('eligibilityStatus(address,uint64)');
  const requestId = BigInt(opts.requestId);
  for (const [i, wallet] of wallets.entries()) {
    await send(deployer, verifier, encodeCall(setStatus, encodeAddress(wallet), encodeUint256(requestId), encodeUint256(BigInt(i))));
    const [status] = await call(verifier, encodeCall(eligibilityStatus, encodeAddress(wallet), encodeUint256(requestId)));
    if (Number(status) !== i) return fail(EXIT.FAILED, `seeding failed: ${wallet} reads ${STATES[Number(status)] ?? status} after setStatus ${STATES[i]}`);
  }
  log(`seeded five wallets (${elapsed(tSeed)})`);

  // 8. The record. Indices, never keys.
  const deployment = {
    chainId: LOCAL_CHAIN_ID,
    forkOf: opts.fork ? opts.chain : null,
    verifier,
    contract,
    requestId: opts.requestId,
    deployer: { index: DEPLOYER_INDEX, address: deployer },
    wallets: wallets.map((address, i) => ({ index: WALLET_INDICES[i], state: STATES[i], address, note: noteFor(WALLET_INDICES[i], STATES[i]) })),
    startedAt,
  };
  writeFileSync(recordPath, JSON.stringify(deployment, null, 2) + '\n');
  const webUrl = wantWeb ? `http://localhost:${opts.webPort}` : null;
  log(`ready in ${elapsed(t0)}`);
  if (opts.json) process.stdout.write(JSON.stringify(deployment, null, 2) + '\n');
  else process.stdout.write(renderTable(deployment, { rpcUrl, webUrl, contractName, forkBlock }) + '\n');

  // 9. The web app, pointed at the local chain. next.config.ts reads deployments/local.json for the panel.
  if (wantWeb) {
    const web = spawn(nextBin, ['dev', '--port', String(opts.webPort)], {
      cwd: webDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_CHAIN_ID: String(LOCAL_CHAIN_ID),
        NEXT_PUBLIC_CONTRACT_ADDRESS: contract,
        NEXT_PUBLIC_RPC_URL: rpcUrl,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });
    children.push(web);
    const out = opts.json ? process.stderr : process.stdout;
    const relay = (chunk) => {
      for (const line of String(chunk).split('\n')) if (line.trim()) out.write(`[web] ${line}\n`);
    };
    web.stdout.on('data', relay);
    web.stderr.on('data', relay);
    web.on('exit', (code) => {
      if (!stopping) fail(EXIT.FAILED, `the web app exited with code ${code}`);
    });
  } else if (opts.web && !hasWeb) {
    log('no web/ in this project; Anvil and the seeded contract are running');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(EXIT.FAILED, error instanceof Error ? error.stack || error.message : String(error)));
}
