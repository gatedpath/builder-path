#!/usr/bin/env node
// Pre-flight: the checks the deploy script makes, run before anything is signed. Offline
// checks first (pins, secrets in git, env shape); then, when an RPC answers, the live ones
// (chain id, permission.isAllowed for DEPLOYER, ADMIN_SAFE is a Safe 1.4.1 with threshold >= 2,
// RBNT balance). Exit code 1 on any failure. Reads public addresses only.
//
//   npm run preflight                 # target from CHAIN_ID in .env (default 153)
//   npm run preflight -- --chain 151  # rehearse the mainnet refusal
//   npm run preflight -- --offline    # skip the RPC
//   npm run preflight -- --rpc http://127.0.0.1:8545   # against a local anvil
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainById, createRpc, isAllowed, formatUnits, addresses, keccak256Hex } from '@gatedpath/chains';
import { scanText } from '@gatedpath/preflight';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const chainArg = argValue('--chain') ? Number(argValue('--chain')) : undefined;
const rpcArg = argValue('--rpc');

loadDotEnv(resolve(root, '.env'));
const chainId = chainArg ?? Number(process.env.CHAIN_ID ?? 153);
const chain = chainById(chainId);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

console.log(`pre-flight for chain ${chainId}${chain ? ` (${chain.name})` : ''}\n`);

// ---- offline ----
check('chain id is a Redbelly network', Boolean(chain), chain ? undefined : 'CHAIN_ID must be 151 or 153');

const toml = readFileSync(resolve(root, 'contracts/foundry.toml'), 'utf8');
check('foundry.toml pins solc 0.8.30 and prague', /solc_version\s*=\s*"0\.8\.30"/.test(toml) && /evm_version\s*=\s*"prague"/.test(toml));
if (existsSync(resolve(root, 'hardhat/hardhat.config.ts'))) {
  const hh = readFileSync(resolve(root, 'hardhat/hardhat.config.ts'), 'utf8');
  check('hardhat.config.ts carries the same pins and no key', /version:\s*"0\.8\.30"/.test(hh) && /evmVersion:\s*"prague"/.test(hh) && !/0x[0-9a-fA-F]{64}/.test(hh));
}

// The secret checks read git. Without a repository they used to pass with nothing looked at: `git()`
// swallowed the error and returned an empty list (audit of 2026-09-19). Now the files on disk are
// scanned instead, and the two checks that are about git say that they could not run.
const inRepo = git('rev-parse --is-inside-work-tree')[0] === 'true';
const tracked = inRepo ? git('ls-files') : [];
if (inRepo) {
  const envTracked = tracked.filter((f) => /(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example'));
  check('no .env or keystore is tracked by git', envTracked.length === 0 && !tracked.some((f) => /keystore/i.test(f)), envTracked.join(', ') || undefined);
  const history = git('log --all --diff-filter=A --name-only --pretty=format:');
  check('no .env ever committed in history', !history.some((f) => /(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example')));
} else {
  check('no .env or keystore is tracked by git', false, 'this folder is not a git repository yet, so nothing could be checked: run git init && git add -A && git commit first');
  check('no .env ever committed in history', false, 'not a git repository yet');
}
// A 0x value of 64 hex characters has the shape of a private key, and also of a hash. One kind of
// hash is let through, and only by proof: a line that states its own preimage, keccak256("X"),
// beside a value that really is keccak256 of X, where X is shaped like a role name (capitals, digits
// and underscores: the role hashes in recipes/business-delegate are written that way). The shape
// rule is there because a key can be derived from a phrase; a sentence or a password as the
// preimage is refused. Any other 64-hex value still fails the check.
const HEX64 = /(?<![0-9a-fA-F])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
function provenHashes(line) {
  const proven = new Set();
  for (const m of line.matchAll(/keccak256\(\\?"([A-Z][A-Z0-9_]*)\\?"\)/g)) {
    proven.add(keccak256Hex(new TextEncoder().encode(m[1])).toLowerCase());
  }
  return proven;
}
function hasKeyShapedValue(text) {
  for (const line of text.split(/\r?\n/)) {
    const found = line.match(HEX64);
    if (!found) continue;
    const proven = provenHashes(line);
    if (found.some((v) => !proven.has(v.toLowerCase()))) return true;
  }
  return false;
}
// What is scanned: every text file git tracks OR would track (untracked and not ignored), because a
// key in a file about to be `git add`ed is the one worth catching; outside a repository, the files on
// disk. Not by an allow-list of extensions, which skipped .tsx, .js, .yml and .sh: by a short list of
// what is not text or not yours (binaries, installed and built code).
const NOT_SCANNED = /(^|\/)(node_modules|\.next|\.git)\/|^(contracts|hardhat)\/(lib|out|cache|artifacts|broadcast)\/|^vendor\/[^/]+\/(dist|generated-samples)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.gas-snapshot)$|\.(png|jpe?g|gif|ico|svg|woff2?|ttf|pdf|zip|gz|map|sha256)$/;
const candidates = (inRepo ? git('ls-files --cached --others --exclude-standard') : walk(root)).filter((f) => !NOT_SCANNED.test(f));
const keyShaped = [];
for (const f of candidates) {
  const path = resolve(root, f);
  // git lists a symlink as a file; the scaffold links vendored packages to each other, so skip what is not a plain file
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 1_000_000) continue;
  const text = readFileSync(path, 'utf8');
  // Two readings. This script's own: ANY 0x 64-hex value that does not prove itself is refused, which
  // a working tree this small can afford. The pre-flight package's: the other shapes a secret takes
  // (a bare 64-hex key as MetaMask exports it, KEY=value, a seed phrase, a keystore JSON).
  const kinds = new Set(scanText(text).map((m) => m.kind));
  if (hasKeyShapedValue(text)) kinds.add('hex64');
  if (kinds.size) keyShaped.push(`${f} (${[...kinds].join(', ')})`);
}
check(`no key-shaped value in the project's files, tracked or not (${candidates.length} read)`, candidates.length > 0 && keyShaped.length === 0, keyShaped.join(', ') || (candidates.length === 0 ? 'no file was read' : undefined));

const deployer = process.env.DEPLOYER || '';
check('DEPLOYER is a public address', /^0x[0-9a-fA-F]{40}$/.test(deployer), deployer ? undefined : 'set DEPLOYER in .env to the wallet you sign with');
const adminSafe = process.env.ADMIN_SAFE || '';
if (chainId === 151) {
  check('ADMIN_SAFE is set (mainnet refuses without a Safe)', /^0x[0-9a-fA-F]{40}$/.test(adminSafe));
  check('VERIFIER is set (mainnet never deploys a mock verifier)', /^0x[0-9a-fA-F]{40}$/.test(process.env.VERIFIER || ''));
} else if (!adminSafe) {
  console.log('note ADMIN_SAFE is empty: the deployer will hold admin roles on testnet. Put a Safe there before mainnet.');
}

// ---- live ----
if (!offline && chain) {
  const rpc = createRpc(rpcArg ?? chain.rpcUrls.default.http[0]);
  try {
    const reported = Number(BigInt(await rpc('eth_chainId')));
    check('RPC reports the configured chain id', reported === chainId, `${rpcArg ?? chain.rpcUrls.default.http[0]} says ${reported}`);
    if (/^0x[0-9a-fA-F]{40}$/.test(deployer)) {
      let allowed = false;
      try {
        allowed = await isAllowed(deployer, { rpc });
        check('deployer passes permission.isAllowed', allowed, allowed ? undefined : 'verify the wallet at https://access.redbelly.network');
      } catch (error) {
        check('deployer passes permission.isAllowed', false, `registry did not answer (${error instanceof Error ? error.message : error}); is this RPC a Redbelly network?`);
      }
      const balance = BigInt(await rpc('eth_getBalance', [deployer, 'latest']));
      // A deploy of this size costs a fraction of one RBNT at current prices; ask for a margin.
      check('deployer holds at least 1 RBNT', balance >= 10n ** 18n, `${formatUnits(balance, 18)} RBNT`);
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(adminSafe)) {
      const code = await rpc('eth_getCode', [adminSafe, 'latest']);
      const isContract = code && code !== '0x';
      if (chainId === 151) check('ADMIN_SAFE is a contract', isContract);
      if (isContract) {
        const version = decodeString(await rpc('eth_call', [{ to: adminSafe, data: '0xffa1ad74' }, 'latest'])); // VERSION()
        const master = '0x' + (await rpc('eth_call', [{ to: adminSafe, data: '0xa619486e' }, 'latest'])).slice(-40); // masterCopy()
        const threshold = BigInt(await rpc('eth_call', [{ to: adminSafe, data: '0xe75235b8' }, 'latest'])); // getThreshold()
        const singletons = [addresses.mainnet.safeSingleton.address, addresses.mainnet.safeL2Singleton.address].map((a) => a.toLowerCase());
        const isSafe141 = version === '1.4.1' && singletons.includes(master.toLowerCase());
        const strict = chainId === 151;
        check('ADMIN_SAFE is a Safe 1.4.1 proxy on a canonical singleton', strict ? isSafe141 : true, `VERSION ${version || '?'}, singleton ${master}`);
        check('ADMIN_SAFE threshold >= 2', strict ? threshold >= 2n : true, `threshold ${threshold}`);
      } else if (chainId !== 151) {
        console.log('note ADMIN_SAFE is not a contract on this chain; allowed on testnet, refused on mainnet.');
      }
    }
  } catch (error) {
    check('RPC reachable', false, error instanceof Error ? error.message : String(error));
  }
} else if (offline) {
  console.log('\n(offline: chain id, isAllowed, Safe and balance checks skipped)');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length > 0) {
  console.log(chainId === 151 ? 'Mainnet deploy would be refused. Fix the failures above; the deploy script checks the same things.' : 'Fix the failures above before deploying.');
  process.exit(1);
}
console.log('Pre-flight clear. Sign with `forge script ... --account <keystore-name>`; no key is read here.');

// ---- helpers ----
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
/** Every file under `dir`, relative to the project root; only used when there is no git to ask. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p.slice(root.length + 1));
  }
  return out;
}
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
function decodeString(hex) {
  if (!hex || hex.length < 130) return '';
  const len = Number(BigInt('0x' + hex.slice(66, 130)));
  return Buffer.from(hex.slice(130, 130 + len * 2), 'hex').toString('utf8');
}
