#!/usr/bin/env node
// The policy an agent's send and deploy go through before anything is signed (card 14). This is a
// set of rules a person can read on one screen. It is not a model and it does not detect fraud: a
// request worded around the words below passes the word rule, and the limit and the human line
// are what stand behind it.
//
// The rules live in ONE file the agent does not write to: ~/.config/agent-policy/<project>.json,
// read-only (chmod 444), copied there once by a person from policy/limits.example.json. Nothing in
// a prompt, an argument or the environment can move a limit: this file reads no env var for one,
// takes no flag for one, and refuses when the environment or the request tries to steer it.
// Honest limit: the agent runs as the same OS user as the person, so chmod 444 stops an accident,
// not a determined agent; the file is a line the agent is told not to cross and a check that it
// has not been. A real wall is another OS user, a hardware wallet's own limit, or a Safe threshold.
import { existsSync, lstatSync, mkdirSync, appendFileSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { chainById, createRpc, isAllowed, formatUnits } from '@gatedpath/chains';

export const POLICY_DIR = join(homedir(), '.config', 'agent-policy');
export const policyPath = (root) => join(POLICY_DIR, `${basename(root)}.json`);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX64 = /(?<![0-9a-fA-F])(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/;
// Words that try to move the policy from inside a request. Logged and refused, never obeyed.
const OVERRIDE_WORDS = /\b(urgent(ly)?|asap|immediately|right now|emergency|ceo|cfo|founder|boss|senior|director|the owner (said|asked|approved)|approved by|skip (the )?(check|policy)|raise (the )?limit|override|bypass|just this once)\b/i;
const STEERING_ENV = /POLICY|LIMIT|OVERRIDE|SKIP|URGENT|CONFIRM|FORCE/;
const STEERING_FLAGS = /^--(force|override|limit|max|skip.*|no-(policy|check|confirm)|private-key|yes|confirm)(=|$)/;

/** Reads the one policy file. Refuses a missing, writable or symlinked file; prints the person's command. */
export function loadPolicy(root) {
  const path = policyPath(root);
  const setup = `  mkdir -p ${POLICY_DIR} && cp policy/limits.example.json ${path} && chmod 444 ${path}`;
  if (!existsSync(path)) throw new Error(`no policy file at ${path}. A person (not the agent) runs once:\n${setup}`);
  const st = lstatSync(path);
  if (st.isSymbolicLink()) throw new Error(`${path} is a symlink; the policy file must be a plain file`);
  if (st.mode & 0o222) throw new Error(`${path} is writable (mode ${(st.mode & 0o777).toString(8)}); a person runs: chmod 444 ${path}`);
  const p = JSON.parse(readFileSync(path, 'utf8'));
  if (p.chain !== 31337 && p.chain !== 153) throw new Error(`policy chain ${p.chain}: this policy signs on 31337 (a local fork) and 153 only; never 151`);
  for (const k of ['maxRbnt', 'confirmAboveRbnt']) if (typeof p[k] !== 'string') throw new Error(`policy.${k} must be a decimal RBNT string`);
  const rpc = p.chain === 31337 ? p.rpc : chainById(p.chain).rpcUrls.default.http[0];
  if (!rpc) throw new Error('policy.rpc is required for chain 31337');
  return { ...p, path, rpc, maxWei: parseRbnt(p.maxRbnt), confirmAboveWei: parseRbnt(p.confirmAboveRbnt) };
}

/** "1.5" RBNT to wei, integers only. */
export function parseRbnt(s) {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(String(s).trim());
  if (!m) throw new Error(`amount "${s}" is not a decimal RBNT figure`);
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? '').padEnd(18, '0'));
}
const rbnt = (wei) => `${formatUnits(wei, 18)} RBNT`;

/** Argument parsing shared by send and deploy: known flags only, a value that looks like a key refused. */
export function parseArgs(argv, known) {
  const out = { steering: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (STEERING_FLAGS.test(a)) { out.steering.push(a); continue; }
    if (!known.includes(a)) throw new Error(`unknown option ${a}; this command takes ${known.join(', ')} and nothing else`);
    const v = argv[++i];
    if (v === undefined) throw new Error(`${a} needs a value`);
    if (HEX64.test(v)) throw new Error(`${a} looks like a private key; the signer is a keystore account name or anvil:<index>, never a key`);
    out[a.slice(2)] = v;
  }
  return out;
}

/** The signer: anvil:<2..9> on the local fork, a keystore account name on 153. Resolves to a public address. Never a key. */
export async function resolveSigner(from, policy, rpc, run) {
  if (!from) throw new Error('--from <anvil:index | keystore-name> is required');
  const anvil = /^anvil:(\d)$/.exec(from);
  if (policy.chain === 31337) {
    if (!anvil) return { ok: false, reason: `on the local fork the signer is anvil:<index>, got "${from}"` };
    if (Number(anvil[1]) < 2) return { ok: false, reason: 'anvil:0 and anvil:1 are never used: their keys are public and they pass isAllowed on the real networks' };
    const accounts = await rpc('eth_accounts');
    return { ok: true, address: accounts[Number(anvil[1])], castArgs: ['--from', accounts[Number(anvil[1])], '--unlocked'], forgeArgs: ['--sender', accounts[Number(anvil[1])], '--unlocked'] };
  }
  if (anvil || !/^[A-Za-z0-9_-]+$/.test(from)) return { ok: false, reason: `on chain ${policy.chain} the signer is a Foundry keystore account name, got "${from}"` };
  const r = run('cast', ['wallet', 'address', '--account', from]); // asks the keystore password at the terminal; the key stays there
  if (r.status !== 0 || !ADDRESS.test(r.stdout.trim())) return { ok: false, reason: `cast wallet address --account ${from} did not give an address` };
  // --sender beside --account, or forge rehearses the script as its own default sender and the deploy
  // script's pre-flight rightly refuses it (found on the first real run, 17 October 2026).
  return { ok: true, address: r.stdout.trim(), castArgs: ['--account', from], forgeArgs: ['--account', from, '--sender', r.stdout.trim()] };
}

// ---------------------------------------------------------------------------------------------
// The rules. Every check runs and is reported, the way a ship report lists every check.
// request: { kind: 'send'|'deploy', to?, amountWei?, reason, argv, env, signer: {ok, address, reason?} }
export async function decide(request, policy, rpc, env = process.env) {
  const checks = [];
  const check = (id, status, reason) => checks.push({ id, status, reason });

  const reported = Number(BigInt(await rpc('eth_chainId')));
  check('chain', reported === policy.chain ? 'pass' : 'fail', `the policy is for chain ${policy.chain}; the RPC ${policy.rpc} reports ${reported}`);

  check('signer', request.signer.ok ? 'pass' : 'fail', request.signer.ok ? `${request.signer.address}, a ${policy.chain === 31337 ? 'local Anvil account' : 'keystore account'}; no key read` : request.signer.reason);

  const steeringEnv = Object.keys(env).filter((k) => STEERING_ENV.test(k) && !/^npm_/.test(k));
  const words = OVERRIDE_WORDS.exec(`${request.reason ?? ''} ${request.argv.join(' ')}`);
  const steer = [...(words ? [`the request says "${words[0]}"`] : []), ...(steeringEnv.length ? [`environment sets ${steeringEnv.join(', ')}`] : []), ...(request.steering.length ? [`flag ${request.steering.join(' ')}`] : [])];
  check('no-override', steer.length ? 'fail' : 'pass', steer.length ? `${steer.join('; ')}: logged and refused, not obeyed. Urgency and seniority do not move a limit` : 'nothing in the request or the environment asked for more than the policy allows');

  if (request.kind === 'send') {
    let allowed = null, code = '0x';
    if (ADDRESS.test(request.to ?? '')) {
      try { [allowed, code] = [await isAllowed(request.to, { rpc }), await rpc('eth_getCode', [request.to, 'latest'])]; } catch (e) { allowed = `registry did not answer: ${e.message}`; }
    }
    const isWallet = code === '0x';
    check('recipient-allowed', allowed === true && isWallet ? 'pass' : 'fail', !ADDRESS.test(request.to ?? '') ? `"${request.to}" is not an address` : typeof allowed === 'string' ? allowed : !isWallet ? `${request.to} is a contract, not a wallet that passed the gate; this policy sends to wallets` : allowed ? `${request.to} passes permission.isAllowed on chain ${reported}, read through the bootstrap registry` : `${request.to} does not pass permission.isAllowed on chain ${reported}: the network's gate, not a recipe`);
    check('amount-under-limit', request.amountWei <= policy.maxWei ? 'pass' : 'fail', `${rbnt(request.amountWei)} against the policy's maxRbnt ${policy.maxRbnt} (${policy.path})`);
    const needsPerson = request.amountWei > policy.confirmAboveWei;
    check('human-line', needsPerson ? 'wait' : 'pass', needsPerson ? `${rbnt(request.amountWei)} is above confirmAboveRbnt ${policy.confirmAboveRbnt}: a person types the confirmation at the terminal` : `${rbnt(request.amountWei)} is at or below confirmAboveRbnt ${policy.confirmAboveRbnt}`);
  } else {
    let allowed = null;
    if (request.signer.ok) { try { allowed = await isAllowed(request.signer.address, { rpc }); } catch (e) { allowed = `registry did not answer: ${e.message}`; } }
    check('deployer-allowed', allowed === true ? 'pass' : 'fail', typeof allowed === 'string' ? allowed : allowed ? `${request.signer.address} passes permission.isAllowed on chain ${reported}` : `the deployer does not pass permission.isAllowed on chain ${reported}`);
    check('human-line', 'wait', 'a deploy always waits for a person to type the confirmation; its cost is in npm run gas');
  }
  const refused = checks.some((c) => c.status === 'fail');
  return { checks, verdict: refused ? 'refused' : checks.some((c) => c.status === 'wait') ? 'waits' : 'allowed' };
}

/** The person's confirmation, read from the terminal itself (/dev/tty), never from stdin, so a pipe cannot type it. */
export function personConfirms(phrase) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); } catch { return { ok: false, reason: 'no terminal is attached, so no person can type the confirmation; run this command in a terminal' }; }
  process.stderr.write(`\nA person types exactly:  ${phrase}\n> `);
  const buf = Buffer.alloc(512); const n = readSync(fd, buf); closeSync(fd);
  const typed = buf.subarray(0, n).toString('utf8').trim();
  return typed === phrase ? { ok: true, reason: 'a person typed the confirmation at the terminal' } : { ok: false, reason: 'the typed confirmation did not match; nothing sent' };
}

// ---------------------------------------------------------------------------------------------
// The record, in the ship report's shape: the header comment, a title, a checks table with a reason per row.
export function recordDecision(root, policy, request, decision, final) {
  const dir = join(root, 'deployments'); mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString(); const date = now.slice(0, 10);
  const path = join(dir, `policy-${policy.chain}-${date}.md`);
  const L = [];
  if (!existsSync(path)) L.push(`# Policy decisions: chain ${policy.chain}, ${date}`, '', `Written by scripts/policy.mjs for \`${root}\`, one section per request, in the shape of the ship report. Rules from \`${policy.path}\`. A set of rules, not a model that detects fraud. Nothing here signs; a signer is an account name, never a key.`, '');
  L.push(`<!-- redbelly-policy chain=${policy.chain} date=${date} ok=${final === 'allowed'} generatedAt=${now} -->`);
  const what = request.kind === 'deploy' ? 'script/Deploy.s.sol' : request.amountWei === undefined ? 'a request refused before it was read' : `${rbnt(request.amountWei)} to ${request.to}`;
  L.push(`## ${request.kind} ${final}: ${what} from ${request.signer.address ?? request.from}`, '');
  if (request.reason) L.push(`Reason given: "${request.reason}"`, '');
  L.push('| Check | Result | Reason |', '|---|---|---|');
  for (const c of decision.checks) L.push(`| \`${c.id}\` | ${c.status} | ${c.reason.replace(/\|/g, '\\|')} |`);
  L.push('');
  appendFileSync(path, L.join('\n') + '\n');
  return path;
}
/** The same checks on the terminal, in renderShipText's layout. */
export function printDecision(decision, header) {
  const lines = [header, 'This is a set of rules, not a model that detects fraud.', ''];
  for (const c of decision.checks) lines.push(`${c.status.padEnd(5)} ${c.id.padEnd(18)} ${c.reason}`);
  process.stdout.write(lines.join('\n') + '\n');
}
