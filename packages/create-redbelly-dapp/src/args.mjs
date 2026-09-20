import { DEFAULTS, PACKAGE_MANAGERS, TEMPLATES } from './options.mjs';

export class UsageError extends Error {}

/** Parses argv into { name, answers, flags }. Unknown flags are errors, not surprises. */
export function parseArgs(argv) {
  const answers = {};
  const flags = { yes: false, install: DEFAULTS.install, force: false, help: false, version: false, listTemplates: false };
  let name;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--version' || arg === '-v') flags.version = true;
    else if (arg === '--list-templates') flags.listTemplates = true;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--install') flags.install = true;
    else if (arg === '--no-install') flags.install = false;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--hardhat') answers.hardhat = true;
    else if (arg === '--no-hardhat') answers.hardhat = false;
    else if (arg === '--web') answers.web = true;
    else if (arg === '--no-web') answers.web = false;
    else if (arg === '--template' || arg.startsWith('--template=')) answers.template = arg.includes('=') ? arg.split('=')[1] : next();
    else if (arg === '--pm' || arg.startsWith('--pm=')) answers.packageManager = arg.includes('=') ? arg.split('=')[1] : next();
    else if (arg === '--name' || arg.startsWith('--name=')) name = arg.includes('=') ? arg.split('=')[1] : next();
    else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
    else if (name === undefined) name = arg;
    else throw new UsageError(`unexpected argument ${arg}`);
  }
  if (answers.template !== undefined && !(answers.template in TEMPLATES)) {
    throw new UsageError(`unknown template ${answers.template}; one of ${Object.keys(TEMPLATES).join(', ')}`);
  }
  if (answers.packageManager !== undefined && !(answers.packageManager in PACKAGE_MANAGERS)) {
    throw new UsageError(`unknown package manager ${answers.packageManager}; one of ${Object.keys(PACKAGE_MANAGERS).join(', ')}`);
  }
  if (name !== undefined) validateName(name);
  return { name, answers, flags };
}

const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/** A bare name follows npm package rules; a path is allowed and its last segment is the name. */
export function validateName(name) {
  if (name === '.') return;
  const base = name.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  if (!base || !NAME_RE.test(base) || base.length > 214) {
    throw new UsageError(`project name "${base ?? name}" must be lowercase letters, digits, dots, dashes or underscores (npm package rules), or "." for the current directory`);
  }
}
