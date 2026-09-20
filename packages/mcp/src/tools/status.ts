// status: where a project is on the path, and the one next command. Makes no network call unless
// `rpc` is given; everything else is the file system plus forge on the local machine (forge build,
// forge test --json). The order is fixed by PLAN.md 18.2: compile, tests, five-state tests, Slither,
// rules files, pre-flight, testnet deploy, verify, ship report. `next` is the first of those that is
// not done, with the exact command, or with `why` saying what the step needs when it signs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { failureByKind, formats, matchText, targetPath, writeRulesFiles } from '@gatedpath/agent-rules';
import { checkSlitherReport, parseShipHeader, readDotEnv, readProjectConfig, runProcess, utcDate } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { forgeRefusal } from '../forge-guard.js';
import { preflightCli } from '../paths.js';
import { rpcFor } from '../rpc.js';
import { findGatedSuites, projectPins, projectSchema } from './project.js';
import { chainSchema, rpcSchema } from './read-only.js';
import { readDeployments, routescanVerifierUrl } from './signing.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const STEPS = ['compile', 'tests', 'five-state tests', 'Slither', 'rules files', 'pre-flight', 'testnet deploy', 'verify', 'ship report'] as const;
export type Step = (typeof STEPS)[number];

export const statusInput = z.object({
  project: projectSchema.describe('Absolute path of the project: a scaffold root (with contracts/foundry.toml) or a bare Foundry project'),
  rpc: rpcSchema.describe('Given: pre-flight runs read-only against it and Routescan is asked about a testnet deployment. Absent: no network call at all'),
  chain: chainSchema.optional().describe('With rpc: the chain pre-flight expects; default 153'),
}).strict();

export interface Status {
  compiles: boolean;
  tests: { passed: number; failed: number; fiveState: boolean };
  slither: { present: boolean; fresh: boolean };
  rulesFiles: 'match' | 'drifted' | 'missing';
  deployments: { local: unknown; 153: unknown; 151: unknown };
  next: { step: Step | 'done'; command: string | null; why: string };
}

const RULES_FORMATS = formats.filter((f) => f !== 'llms' && f !== 'llms-full');

function layout(project: string): { root: string; contracts: string; scaffold: boolean } {
  if (existsSync(join(project, 'foundry.toml'))) {
    const parent = resolve(project, '..');
    const scaffold = basename(project) === 'contracts' && existsSync(join(parent, 'package.json')) && existsSync(join(parent, 'scripts', 'dev.mjs'));
    return scaffold ? { root: parent, contracts: project, scaffold: true } : { root: project, contracts: project, scaffold: false };
  }
  if (existsSync(join(project, 'contracts', 'foundry.toml'))) return { root: project, contracts: join(project, 'contracts'), scaffold: existsSync(join(project, 'scripts', 'dev.mjs')) };
  return { root: project, contracts: project, scaffold: false };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Deployment records for a real chain: `deployments/<chain>.json`, `deployments/<chain>-<Name>.json`, and forge's broadcast folder. */
export function readChainDeployments(dirs: string[], chain: 151 | 153): { records: Array<{ file: string; record: unknown }>; broadcast: Array<{ script: string; file: string; deployed: ReturnType<typeof readDeployments> }> } | null {
  const records: Array<{ file: string; record: unknown }> = [];
  const broadcast: Array<{ script: string; file: string; deployed: ReturnType<typeof readDeployments> }> = [];
  for (const dir of dirs) {
    const dep = join(dir, 'deployments');
    if (existsSync(dep)) {
      for (const name of readdirSync(dep).sort()) {
        if (name === `${chain}.json` || (name.startsWith(`${chain}-`) && name.endsWith('.json'))) {
          const record = readJson(join(dep, name));
          if (record) records.push({ file: join(dep, name), record });
        }
      }
    }
    const bc = join(dir, 'broadcast');
    if (existsSync(bc)) {
      for (const script of readdirSync(bc).sort()) {
        const latest = join(bc, script, String(chain), 'run-latest.json');
        if (existsSync(latest)) broadcast.push({ script, file: latest, deployed: readDeployments(latest) });
      }
    }
  }
  return records.length || broadcast.length ? { records, broadcast } : null;
}

export interface ShipReportSeen {
  file: string;
  chain: number;
  date: string;
  /** From the header `redbelly ship` writes; null for a hand-written report. */
  ok: boolean | null;
  /** Whether the header's chain and date are the ones in the file's name; null when there is no header. */
  headerMatchesName: boolean | null;
  headerChain: number | null;
  generatedAt: string | null;
  today: boolean;
}

/** One phrase per report: what it is, and whether the deploy script would take it. */
function describeShips(ships: ShipReportSeen[]): string {
  return ships.map((s) => `${basename(s.file)} (${s.ok === null ? 'no redbelly ship header, so the deploy script refuses it' : s.headerMatchesName === false ? `its header is for chain ${s.headerChain}, not what its name says, so the deploy script refuses it` : s.ok ? 'every check passed' : 'a check failed'}${s.today ? ', dated today' : ', not today; the deploy script wants today\'s'})`).join(', ');
}

/** Every deployments/ship-<chain>-<date>.md, with what its header says. `redbelly ship` writes the header; a hand-written report has none. */
export function shipReports(dirs: string[]): ShipReportSeen[] {
  const out: ShipReportSeen[] = [];
  const today = utcDate();
  for (const dir of dirs) {
    const dep = join(dir, 'deployments');
    if (!existsSync(dep)) continue;
    for (const name of readdirSync(dep)) {
      const m = /^ship-(\d+)-(\d{4}-\d{2}-\d{2})\.md$/.exec(name);
      if (!m) continue;
      const file = join(dep, name);
      let header: ReturnType<typeof parseShipHeader> = null;
      try {
        header = parseShipHeader(readFileSync(file, 'utf8'));
      } catch {
        header = null;
      }
      // The deploy scripts read the header and require it to agree with the name. A report whose
      // header is for another chain or day is not a passing report for the chain in its name.
      const headerMatchesName = header ? header.chain === Number(m[1]) && header.date === m[2] : null;
      out.push({ file, chain: Number(m[1]), date: m[2]!, ok: header ? header.ok && headerMatchesName === true : null, headerMatchesName, headerChain: header?.chain ?? null, generatedAt: header?.generatedAt ?? null, today: m[2] === today });
    }
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

type ForgeTests = Record<string, { test_results: Record<string, { status: string }> }>;

export async function status(args: z.infer<typeof statusInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const refusal = forgeRefusal(project);
  if (refusal) return fail(refusal, { project: project });
  const { root, contracts, scaffold } = layout(project);
  const foundry = existsSync(join(contracts, 'foundry.toml'));
  const dirs = root === contracts ? [root] : [root, contracts];
  const cdContracts = scaffold ? 'cd contracts && ' : '';

  // 1. compile
  let compiles = false;
  let compileWhy = '';
  let compileCommand = `${cdContracts}forge build`;
  if (!foundry) {
    compileWhy = `no foundry.toml in ${contracts}; status knows the Foundry path (the five-state helper is Foundry-only). Point project at the folder that holds it.`;
  } else {
    const b = await runProcess('forge', ['build'], { cwd: contracts, timeoutMs: 600_000 });
    if (b.spawnError) {
      const e = failureByKind('forge-not-found')!;
      compileWhy = `${e.plainWords} ${e.cause}`;
      compileCommand = e.fix.command ?? compileCommand;
    } else if (b.code !== 0 || /Compiler run failed/.test(b.stderr + '\n' + b.stdout)) {
      // The output decides as well as the exit code: the @foundry-rs npm shims (bin.mjs, 1.7.1) were seen on
      // 14 September 2026 exiting 0 whatever the binary returned. A lint warning prints "Error: Lint failed"
      // and then compiles, which is not a failed build, so only the compiler's own line counts.
      const text = (b.stderr + '\n' + b.stdout).trim();
      const e = matchText(text);
      if (e?.kind === 'forge-std-missing' && scaffold) {
        compileWhy = `${e.plainWords} ${e.cause}`;
        compileCommand = 'npm run contracts:install';
      } else if (e) {
        compileWhy = `${e.plainWords} ${e.cause}`;
        if (e.fix.command) compileCommand = e.fix.command;
      } else {
        compileWhy = `forge build exited ${b.code}: ${text.slice(-600)}`;
      }
    } else {
      compiles = true;
    }
  }

  // 2 and 3. tests and the five-state suites, from one forge test --json run
  const tests = { passed: 0, failed: 0, fiveState: false };
  let suites: string[] = [];
  let suiteFailed = 0;
  let testsWhy = '';
  if (compiles) {
    suites = findGatedSuites(contracts);
    const t = await runProcess('forge', ['test', '--json'], { cwd: contracts, timeoutMs: 600_000 });
    let parsed: ForgeTests | null = null;
    try {
      parsed = JSON.parse(t.stdout) as ForgeTests;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      testsWhy = `forge test did not print JSON (exit ${t.code}): ${(t.stderr || t.stdout).trim().slice(-600)}`;
    } else {
      for (const [suitePath, v] of Object.entries(parsed)) {
        const suiteName = suitePath.split(':').pop() ?? suitePath;
        const inSuite = suites.includes(suiteName);
        for (const r of Object.values(v.test_results)) {
          if (r.status === 'Success') tests.passed++;
          else if (r.status === 'Failure') {
            tests.failed++;
            if (inSuite) suiteFailed++;
          }
        }
      }
      tests.fiveState = suites.length > 0 && suiteFailed === 0 && tests.failed === 0 ? true : suites.length > 0 && suiteFailed === 0 && tests.passed > 0;
      if (tests.failed > 0) testsWhy = `${tests.failed} test${tests.failed === 1 ? '' : 's'} failed.`;
      else if (tests.passed === 0) testsWhy = 'No test ran.';
    }
  }

  // 4. Slither
  const config = foundry ? readProjectConfig(contracts) : null;
  const slitherResult = foundry ? await checkSlitherReport(contracts, config?.sourceDir ?? 'src') : null;
  const slither = {
    present: slitherResult ? slitherResult.status !== 'fail' || !/^No Slither report/.test(slitherResult.reason) : false,
    fresh: slitherResult?.status === 'pass',
  };

  // 5. rules files, the five an agent reads (llms.txt is the site's)
  const rulesCheck = writeRulesFiles(root, { check: true, dryRun: true, only: RULES_FORMATS });
  const rulesPresent = RULES_FORMATS.filter((f) => existsSync(join(root, targetPath[f])));
  const rulesFiles: Status['rulesFiles'] = rulesPresent.length === 0 ? 'missing' : rulesCheck.drifted.length === 0 ? 'match' : 'drifted';

  // deployments
  const localPath = [join(root, 'deployments', 'local.json'), join(contracts, 'deployments', 'local.json')].find((p) => existsSync(p));
  const deployments = {
    local: localPath ? readJson(localPath) : null,
    153: readChainDeployments(dirs, 153),
    151: readChainDeployments(dirs, 151),
  };

  // 6. pre-flight, only with an rpc
  const env = readDotEnv(root, process.env);
  const chain = args.chain ?? 153;
  const deployer = env['DEPLOYER'];
  const admin = env['ADMIN_SAFE'];
  const preflightArgs = ['--project', contracts, '--chain', String(chain), ...(deployer ? ['--address', deployer] : []), ...(admin ? ['--admin', admin] : [])];
  const preflightCommand = `redbelly-preflight ${preflightArgs.map((a) => (a === contracts ? (scaffold ? 'contracts' : a) : a)).join(' ')}${deployer ? '' : ' --address <deployer public address>'}`;
  let preflight: { ran: boolean; ok: boolean | null; failing: Array<{ id: string; reason: string }>; command: string; report?: unknown } = { ran: false, ok: null, failing: [], command: preflightCommand };
  if (args.rpc && foundry) {
    const rpc = rpcFor(chain, args.rpc);
    const r = await runProcess(process.execPath, [preflightCli(), ...preflightArgs, '--rpc', rpc, '--json'], { cwd: contracts, timeoutMs: 180_000 });
    try {
      const report = JSON.parse(r.stdout) as { ok: boolean; checks: Array<{ id: string; status: string; reason: string }> };
      preflight = { ran: true, ok: report.ok, failing: report.checks.filter((c) => c.status === 'fail').map((c) => ({ id: c.id, reason: c.reason })), command: `${preflightCommand} --rpc ${rpc}`, report };
    } catch {
      preflight = { ran: true, ok: false, failing: [{ id: 'run', reason: `pre-flight could not run (exit ${r.code}): ${(r.stderr || r.stdout).trim().slice(-600)}` }], command: `${preflightCommand} --rpc ${rpc}` };
    }
  }

  // 8. verify, asked of Routescan only with an rpc
  let verified: boolean | null = null;
  const testnetRecord = deployments[153]?.records[0]?.record as { contract?: string; verifiedAt?: string } | undefined;
  const testnetAddress = testnetRecord?.contract ?? deployments[153]?.broadcast.flatMap((b) => b.deployed).at(-1)?.address ?? null;
  if (testnetRecord?.verifiedAt) verified = true;
  else if (args.rpc && testnetAddress) {
    try {
      const url = `${routescanVerifierUrl(153)}/api?module=contract&action=getsourcecode&address=${testnetAddress}`;
      const res = await fetch(url);
      const body = (await res.json()) as { result?: Array<{ SourceCode?: string }> };
      verified = Boolean(body.result?.[0]?.SourceCode);
    } catch {
      verified = null;
    }
  }
  const ships = shipReports(dirs);

  // next: the first step that is not done, in the fixed order
  const contractName = testnetRecord ? basename(deployments[153]!.records[0]!.file, '.json').replace(/^153-/, '') : null;
  const pins = foundry ? projectPins(contracts) : { solc: null, evm: null, runs: null };
  const verifyCommand = testnetAddress
    ? `${cdContracts}forge verify-contract ${testnetAddress} src/${contractName ?? '<Name>'}.sol:${contractName ?? '<Name>'} --verifier etherscan --verifier-url ${routescanVerifierUrl(153)} --etherscan-api-key verifyContract --chain 153 --compiler-version ${pins.solc ?? '0.8.30'} --evm-version ${pins.evm ?? 'prague'}${pins.runs !== null ? ` --num-of-optimizations ${pins.runs}` : ''} --constructor-args <cast abi-encode output> --watch`
    : null;
  let next: Status['next'];
  if (!compiles) next = { step: 'compile', command: compileCommand, why: compileWhy };
  else if (tests.failed > 0 || tests.passed === 0) next = { step: 'tests', command: scaffold ? 'npm test' : 'forge test', why: testsWhy || 'Tests have not passed.' };
  else if (!tests.fiveState)
    next = {
      step: 'five-state tests',
      command: suites.length ? `${cdContracts}forge test --match-contract '^(${suites.join('|')})$'` : `${cdContracts}forge test`,
      why: suites.length ? `${suiteFailed} test${suiteFailed === 1 ? '' : 's'} failed in the suites that inherit GatedTest (${suites.join(', ')}).` : 'No test contract inherits GatedTest. Every gated function needs a suite that proves it against all five credential states (assertRevertsForAllInvalidStates or assertGatedPair from @gatedpath/receptor-mock).',
    };
  else if (!slither.present || !slither.fresh)
    next = { step: 'Slither', command: scaffold ? 'npm run lint:slither' : `${cdContracts}slither . --json reports/slither.json`, why: slitherResult?.reason ?? 'No Slither report.' };
  else if (rulesFiles !== 'match')
    next = { step: 'rules files', command: scaffold ? 'npm run rules:write' : `redbelly-agent-rules --out ${root}`, why: rulesFiles === 'missing' ? 'No rules file is in the project, so an agent working here has none of the network facts or the never-do list.' : `Drifted from the render: ${rulesCheck.drifted.join(', ')}.` };
  else if (preflight.ran && preflight.ok === false) {
    const first = preflight.failing[0]!;
    const entry = failureByKind(`preflight-${first.id}`);
    next = { step: 'pre-flight', command: entry?.fix.command ?? preflight.command, why: `${first.id} failed: ${first.reason}${entry ? ` ${entry.plainWords}` : ''}` };
  } else if (!preflight.ran && !deployments[153])
    next = { step: 'pre-flight', command: preflight.command, why: `Not run in this call: status makes no network call without rpc. Pass rpc (${rpcFor(chain)} for ${chain}) to run it here, read-only; it needs the deployer's public address (DEPLOYER in .env or --address), never a key.` };
  else if (!deployments[153])
    next = {
      step: 'testnet deploy',
      command: `${cdContracts}forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast`,
      why: "This step signs. It needs a Foundry keystore whose address passes permission.isAllowed on 153 and holds RBNT for the gas; status never signs and won't invent a keystore name. Until you have one, run npm run dev for the local loop.",
    };
  else if (verified !== true)
    next = {
      step: 'verify',
      command: verifyCommand,
      why: verified === false ? `Routescan holds no verified source for ${testnetAddress} on 153.` : `Not checked: pass rpc and status asks Routescan whether ${testnetAddress} is verified; or set verifiedAt in the deployment record once forge verify-contract reports success.`,
    };
  else if (!ships.some((x) => x.ok === true))
    next = {
      step: 'ship report',
      command: scaffold ? `npm run ship -- --chain ${chain} --account <keystore-name>${chain === 151 ? ' --admin <safe>' : ''}` : `${cdContracts}redbelly ship --chain ${chain} --account <keystore-name>${chain === 151 ? ' --admin <safe>' : ''}`,
      why: `${ships.length ? `Found ${describeShips(ships)}, and none is a passing redbelly ship report. ` : 'No deployments/ship-<chain>-<date>.md yet. '}redbelly ship runs pre-flight, the Slither check, the five-state tests and the gas report and writes the file only when every check passed; the deploy script refuses 151 without one dated today (153 warns). It needs the keystore name for the deployer's address and never signs.`,
    };
  else
    next = {
      step: 'done',
      command: null,
      why: `Ship report present: ${describeShips(ships)}.`,
    };

  const result: Status & Record<string, unknown> = {
    compiles,
    tests,
    slither,
    rulesFiles,
    deployments,
    next,
    project: root,
    contracts,
    scaffold,
    suites,
    slitherReason: slitherResult?.reason ?? null,
    rulesDrifted: rulesCheck.drifted,
    preflight,
    verified,
    shipReports: ships,
    networkCalls: args.rpc ? 'pre-flight against rpc, and Routescan for a testnet deployment' : 'none',
  };
  return ok(result);
}
