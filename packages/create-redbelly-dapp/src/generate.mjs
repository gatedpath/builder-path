// Turns answers into a project directory. Pure file work: copy the template trees,
// render placeholders, vendor the two built packages this scaffold depends on, generate
// the Solidity address library from @gatedpath/chains and write the rules files
// through @gatedpath/agent-rules. No network, no key, no prompt for one.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_MANAGERS, TEMPLATES } from './options.mjs';
import { isTextFile, outputName, renderText } from './render.mjs';
import { builtSibling, loadSibling, siblingRoot, siblingVersion, SIBLINGS } from './siblings.mjs';
import { copyRecipes } from './recipes-copy.mjs';
import { renderRedbellySol } from './render-sol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = resolve(here, '..', 'templates');
const PACKAGE_DIR = resolve(here, '..');
export const RULES_FORMATS = Object.freeze(['claude', 'agents', 'cursor', 'copilot', 'gemini']);

export class TemplateNotReady extends Error {
  constructor(template) {
    const t = TEMPLATES[template];
    super(
      `template "${template}" is a documented stub and is not shipped yet. It is missing:\n` +
        t.missing.map((m) => `  - ${m}`).join('\n') +
        `\nUse gated-erc20 or empty, or contribute the stub (see the scaffolder README).`,
    );
    this.template = template;
  }
}

export function assertTemplateReady(template) {
  if (!TEMPLATES[template].ready) throw new TemplateNotReady(template);
}

export function assertTargetUsable(targetDir, force) {
  if (!existsSync(targetDir)) return;
  if (!statSync(targetDir).isDirectory()) throw new Error(`${targetDir} exists and is not a directory`);
  const entries = readdirSync(targetDir).filter((e) => !['.git', '.DS_Store'].includes(e));
  if (entries.length > 0 && !force) {
    throw new Error(`${targetDir} is not empty (${entries.slice(0, 5).join(', ')}${entries.length > 5 ? ', ...' : ''}); pass --force to write into it`);
  }
}

export function buildVars({ name, answers, version, chains }) {
  const pm = PACKAGE_MANAGERS[answers.packageManager];
  const t = TEMPLATES[answers.template];
  const m = chains.addresses.mainnet;
  const tn = chains.addresses.testnet;
  return {
    // Network facts, from @gatedpath/chains so nothing is retyped by hand.
    BOOTSTRAP_REGISTRY: m.bootstrapRegistry.address,
    MAINNET_PERMISSION: m.permission.address,
    TESTNET_PERMISSION: tn.permission.address,
    SAFE_SINGLETON: m.safeSingleton.address,
    SAFE_L2_SINGLETON: m.safeL2Singleton.address,
    SAFE_PROXY_FACTORY: m.safeProxyFactory.address,
    SAFE_FALLBACK_HANDLER: m.safeFallbackHandler.address,
    MAINNET_RPC: chains.redbellyMainnet.rpcUrls.default.http[0],
    TESTNET_RPC: chains.redbellyTestnet.rpcUrls.default.http[0],
    MAINNET_EXPLORER: chains.redbellyMainnet.blockExplorers.default.url,
    TESTNET_EXPLORER: chains.redbellyTestnet.blockExplorers.default.url,
    MAINNET_EXPLORER_API: chains.redbellyMainnet.blockExplorers.default.apiUrl,
    TESTNET_EXPLORER_API: chains.redbellyTestnet.blockExplorers.default.apiUrl,
    // Foundry's [etherscan] url wants the base without the trailing /api.
    MAINNET_EXPLORER_API_BASE: chains.redbellyMainnet.blockExplorers.default.apiUrl.replace(/\/api$/, ''),
    TESTNET_EXPLORER_API_BASE: chains.redbellyTestnet.blockExplorers.default.apiUrl.replace(/\/api$/, ''),
    FACTS_VERIFIED_ON: m.permission.verifiedOn,
    PROJECT_NAME: name,
    TEMPLATE: answers.template,
    CONTRACT_NAME: t.contract,
    PM: answers.packageManager,
    PM_RUN: pm.run,
    PM_EXEC: pm.exec,
    PM_INSTALL: pm.install,
    PM_LOCK: pm.lock,
    SCAFFOLDER_VERSION: version,
    CHAINS_VERSION: siblingVersion('chains'),
    RULES_VERSION: siblingVersion('agentRules'),
    PREFLIGHT_VERSION: siblingVersion('preflight'),
    FRONTEND_KIT_VERSION: answers.web ? siblingVersion('frontendKit') : '',
    hardhat: answers.hardhat,
    web: answers.web,
    npm: answers.packageManager === 'npm',
    pnpm: answers.packageManager === 'pnpm',
    yarn: answers.packageManager === 'yarn',
    gatedErc20: answers.template === 'gated-erc20',
    empty: answers.template === 'empty',
  };
}

/** Copies one template tree into the target, rendering text files. Returns relative paths written. */
export function copyTree(srcDir, targetDir, vars, written) {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, join(targetDir, outputName(entry.name)), vars, written);
      continue;
    }
    const rel = outputName(entry.name);
    const dest = join(targetDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (isTextFile(src)) {
      const rendered = renderText(readFileSync(src, 'utf8'), vars);
      // A template that renders to nothing (a whole-file {{#if}}) is a file this project doesn't need.
      if (rendered.trim() === '') continue;
      writeFileSync(dest, rendered);
    } else {
      cpSync(src, dest);
    }
    written.push(dest);
  }
}

/**
 * Copies a built sibling package (package.json, README, dist) into vendor/<name>. The copied
 * package.json loses its devDependencies (nothing in vendor/ is built or tested) and its
 * `file:../<sibling>` links are pointed at the vendor directory that sibling lives in, so the
 * scaffold's install resolves them beside each other rather than looking for this repository.
 */
export function vendorPackage(key, targetDir) {
  const root = builtSibling(key);
  const dest = join(targetDir, 'vendor', vendorDirName(key));
  mkdirSync(dest, { recursive: true });
  for (const f of ['README.md', 'LICENSE']) {
    if (existsSync(join(root, f))) cpSync(join(root, f), join(dest, f));
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  pointAtVendoredSiblings(pkg);
  writeFileSync(join(dest, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  cpSync(join(root, 'dist'), join(dest, 'dist'), { recursive: true });
  // Relative links so the vendored code resolves its vendored siblings before the first install
  // (`npm run doctor` is meant to run on a bare scaffold). The package manager keeps or replaces
  // them with equivalent links on install.
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
    const m = /^file:\.\.\/([a-z-]+)$/.exec(spec);
    if (!m) continue;
    const link = join(dest, 'node_modules', ...name.split('/'));
    mkdirSync(dirname(link), { recursive: true });
    // Up out of the name's own directories, out of node_modules, out of this package: into vendor/.
    if (!existsSync(link)) symlinkSync(join(...Array.from({ length: name.split('/').length + 1 }, () => '..'), m[1]), link, 'junction');
  }
  // The Solidity renderer rides along so `npm run chains:sync` can regenerate Redbelly.sol.
  if (key === 'chains') cpSync(resolve(here, 'render-sol.mjs'), join(dest, 'render-sol.mjs'));
  return dest;
}

/** The siblings a scaffold carries in vendor/, by package name. */
const VENDORED = ['chains', 'agentRules', 'frontendKit', 'preflight'];

/**
 * Points a vendored package's dependencies on its vendored siblings at `file:../<vendor dir>`, by the
 * dependency's NAME. It used to match the spec `file:../<sibling>`, which is only how the repository
 * writes it: publishing rewrites those to versions, so a scaffolder installed from npm made no links
 * and `npm run doctor` crashed on a bare scaffold with ERR_MODULE_NOT_FOUND (audit of 2026-09-19).
 */
export function pointAtVendoredSiblings(pkg) {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      const sibling = VENDORED.find((k) => SIBLINGS[k].name === name);
      if (sibling) pkg[field][name] = `file:../${vendorDirName(sibling)}`;
    }
  }
  return pkg;
}

export function vendorDirName(key) {
  return { chains: 'redbelly-chains', agentRules: 'redbelly-agent-rules', frontendKit: 'redbelly-frontend-kit', preflight: 'redbelly-preflight' }[key] ?? 'redbelly-receptor-mock';
}

/**
 * Copies the receptor-mock Solidity package into contracts/lib/receptor-mock so the
 * contracts build offline. The layout mirrors what `forge install` would produce.
 */
export function vendorReceptorMock(targetDir) {
  const root = process.env.REDBELLY_RECEPTOR_MOCK_DIR || siblingRoot('receptorMock');
  if (!root || !existsSync(root)) {
    throw new Error(
      `${SIBLINGS.receptorMock.name} not found. The contracts templates inherit its Gated base and test on its GatedTest; ` +
        `it must be beside this package at packages/receptor-mock or named by REDBELLY_RECEPTOR_MOCK_DIR.`,
    );
  }
  const dest = join(targetDir, 'contracts', 'lib', 'receptor-mock');
  mkdirSync(dest, { recursive: true });
  // Only the Solidity and its README travel. The package's own foundry.toml, remappings,
  // node_modules and lib stay behind so the consumer's remappings are the only ones in play.
  for (const part of ['src', 'test']) cpSync(join(root, part), join(dest, part), { recursive: true });
  for (const f of ['README.md', 'package.json']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dest, f));
  writeFileSync(join(dest, 'VENDORED.md'), `Copied from packages/receptor-mock by create-redbelly-dapp. Don't edit here; update the package and re-scaffold or copy src/ and test/ again.\n`);
  return dest;
}

/** Where the eligibility recipes are: the repository's own folder, or the copy a published package carries. */
export function recipesRoot() {
  const candidates = [
    process.env.REDBELLY_RECIPES_DIR,
    resolve(PACKAGE_DIR, '..', '..', 'recipes'),   // in the repository, the one source of truth
    resolve(PACKAGE_DIR, 'recipes'),               // from npm: copied in by `prepack` (scripts/sync-recipes.mjs)
  ].filter(Boolean);
  return candidates.find((c) => existsSync(join(c, 'over-18', 'recipe.json'))) ?? null;
}

/**
 * Copies the eligibility recipes into <project>/recipes. The env example, the deploy scripts and
 * the prompt cards all name `recipes/over-18` and `recipes/au-wholesale-investor`; until this
 * existed a scaffolded project had no such folder, so a builder following the comment, or an agent
 * told to "use the over-18 recipe", had nothing to open. Data and prose only: each recipe's
 * recipe.json and README, and the library's README. check.mjs stays behind; it validates the
 * library, not a project.
 */
export function vendorRecipes(targetDir) {
  const root = recipesRoot();
  if (!root) {
    throw new Error(
      'The eligibility recipes were not found. Expected them at recipes/ in the repository, inside this package ' +
        '(a published copy), or named by REDBELLY_RECIPES_DIR.',
    );
  }
  const dest = join(targetDir, 'recipes');
  const written = copyRecipes(root, dest).map((f) => `recipes/${f}`);
  writeFileSync(join(dest, 'VENDORED.md'), "Copied from the tool's recipes/ folder by create-redbelly-dapp. These are drafts: anything marked \"verify\" in a recipe.json is not pinned by Redbelly's documentation, so do not resolve it by guessing. Don't edit here; re-scaffold or copy the folder again to update.\n");
  written.push('recipes/VENDORED.md');
  return written;
}

/**
 * The gated-erc20 template's contract and tests are not a template at all: they are the
 * contract kit (packages/contract-kit), copied verbatim into contracts/src and contracts/test
 * so there is one copy of GatedERC20 in the repository and the kit's tests run in every
 * scaffold. The kit's exported ABI goes to the web app for the same reason.
 */
export function vendorContractKit(targetDir, { web }) {
  const root = process.env.REDBELLY_CONTRACT_KIT_DIR || siblingRoot('contractKit');
  if (!root || !existsSync(join(root, 'src', 'GatedERC20.sol'))) {
    throw new Error(
      `${SIBLINGS.contractKit.name} not found. The gated-erc20 template is the contract kit's src/ and test/; ` +
        `it must be beside this package at packages/contract-kit or named by REDBELLY_CONTRACT_KIT_DIR.`,
    );
  }
  const written = [];
  for (const part of ['src', 'test']) {
    const dest = join(targetDir, 'contracts', part);
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(join(root, part), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.sol')) continue;
      cpSync(join(root, part, entry.name), join(dest, entry.name));
      written.push(join(dest, entry.name));
    }
  }
  if (web) {
    const abi = join(root, 'abi', 'GatedERC20.json');
    if (!existsSync(abi)) throw new Error(`${abi} missing; run npm run abi:export in ${root}`);
    const dest = join(targetDir, 'web', 'src', 'abi', 'GatedERC20.json');
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(abi, dest);
    written.push(dest);
  }
  return written;
}

/**
 * Hardhat 3 only compiles files inside its own root, so hardhat/src and hardhat/lib are
 * links to ../contracts/src and ../contracts/lib: one set of sources, one set of pins.
 * 'junction' makes this work on Windows without developer mode; POSIX ignores the type.
 */
export function linkHardhatSources(targetDir) {
  for (const name of ['src', 'lib']) {
    const link = join(targetDir, 'hardhat', name);
    if (existsSync(link)) continue;
    symlinkSync(join('..', 'contracts', name), link, 'junction');
  }
}

export async function generate({ targetDir, name, answers, version, log = () => {} }) {
  assertTemplateReady(answers.template);
  const chains = await loadSibling('chains');
  const vars = buildVars({ name, answers, version, chains });
  const written = [];
  mkdirSync(targetDir, { recursive: true });

  log('writing project files');
  copyTree(join(TEMPLATES_DIR, 'base'), targetDir, vars, written);
  copyTree(join(TEMPLATES_DIR, 'contracts', 'common'), join(targetDir, 'contracts'), vars, written);
  copyTree(join(TEMPLATES_DIR, 'contracts', answers.template), join(targetDir, 'contracts'), vars, written);
  if (answers.hardhat) {
    copyTree(join(TEMPLATES_DIR, 'hardhat'), join(targetDir, 'hardhat'), vars, written);
    linkHardhatSources(targetDir);
  }
  if (answers.web) {
    copyTree(join(TEMPLATES_DIR, 'web'), join(targetDir, 'web'), vars, written);
    copyTree(join(TEMPLATES_DIR, 'web-overrides', answers.template), join(targetDir, 'web'), vars, written);
  }

  log('vendoring @gatedpath/chains, @gatedpath/agent-rules and @gatedpath/preflight (npm run doctor, gas and ship)');
  vendorPackage('chains', targetDir);
  vendorPackage('agentRules', targetDir);
  vendorPackage('preflight', targetDir);
  if (answers.web) {
    log('vendoring @gatedpath/frontend-kit for the web app');
    vendorPackage('frontendKit', targetDir);
  }

  log('copying receptor-mock into contracts/lib');
  vendorReceptorMock(targetDir);

  log('copying the eligibility recipes into recipes/');
  written.push(...vendorRecipes(targetDir));

  if (answers.template === 'gated-erc20') {
    log('copying the contract kit (GatedERC20, IssuerRegistry and their tests) into contracts/');
    written.push(...vendorContractKit(targetDir, { web: answers.web }));
  }

  log('generating contracts/script/Redbelly.sol from @gatedpath/chains');
  const solPath = join(targetDir, 'contracts', 'script', 'Redbelly.sol');
  mkdirSync(dirname(solPath), { recursive: true });
  writeFileSync(solPath, renderRedbellySol(chains));
  written.push(solPath);

  log('writing rules files (CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md)');
  const rules = await loadSibling('agentRules');
  const result = rules.writeRulesFiles(targetDir, { only: RULES_FORMATS });
  for (const rel of result.written) written.push(join(targetDir, rel));

  return { written, vars };
}
