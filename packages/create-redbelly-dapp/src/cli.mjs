import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, UsageError } from './args.mjs';
import { collectAnswers } from './prompts.mjs';
import { assertTargetUsable, generate, TemplateNotReady } from './generate.mjs';
import { HELP, PACKAGE_MANAGERS, TEMPLATES } from './options.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')).version;

export async function main(argv, { cwd = process.cwd(), stdout = console.log } = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`create-redbelly-dapp: ${error.message}\n`);
      console.error(HELP);
      return 2;
    }
    throw error;
  }
  const { flags } = parsed;
  if (flags.help) { stdout(HELP); return 0; }
  if (flags.version) { stdout(VERSION); return 0; }
  if (flags.listTemplates) {
    for (const [k, t] of Object.entries(TEMPLATES)) stdout(`${k.padEnd(13)} ${t.ready ? 'ready' : 'stub '}  ${t.label}`);
    return 0;
  }

  const { name, answers } = await collectAnswers({ name: parsed.name, answers: parsed.answers, yes: flags.yes });
  const targetDir = name === '.' ? cwd : resolve(cwd, name);
  const projectName = basename(targetDir);

  try {
    assertTargetUsable(targetDir, flags.force);
    const { written } = await generate({ targetDir, name: projectName, answers, version: VERSION, log: (m) => stdout(`  ${m}`) });
    stdout(`\nScaffolded ${answers.template} into ${targetDir} (${written.length} files).`);
  } catch (error) {
    if (error instanceof TemplateNotReady) {
      console.error(`create-redbelly-dapp: ${error.message}`);
      return 2;
    }
    throw error;
  }

  const pm = PACKAGE_MANAGERS[answers.packageManager];
  if (flags.install) {
    stdout(`\nInstalling with ${answers.packageManager} and forge (the only steps that touch the network)`);
    execSync(`${pm.install}`, { cwd: targetDir, stdio: 'inherit' });
    execSync(`${pm.run} contracts:install`, { cwd: targetDir, stdio: 'inherit' });
  }

  stdout(`
Next steps
  cd ${name === '.' ? '.' : name}${flags.install ? '' : `
  ${pm.install}                 installs the web app and tooling
  ${pm.run} contracts:install   forge install of forge-std and OpenZeppelin at the pinned tags`}
  ${pm.run} test                forge build and forge test (unit, fuzz, invariant) in all five credential states
  ${pm.run} preflight           the checks the deploy script makes, run offline first

Read README.md for the golden path. Nothing in this project reads a private key; deploys use
\`forge script --account <keystore-name>\` or a hardware wallet. Mainnet (151) refuses to deploy
unless ADMIN_SAFE is a Safe 1.4.1 with a threshold of two or more and the deployer passes isAllowed.
${existsSync(resolve(targetDir, 'hardhat')) ? 'The hardhat/ folder compiles the same sources with the same pins; see README.md for its commands.\n' : ''}`);
  return 0;
}
