// Interactive prompts on node:readline. No dependency, no colour library, nothing sent anywhere.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { DEFAULTS, PACKAGE_MANAGERS, TEMPLATES } from './options.mjs';
import { validateName } from './args.mjs';

/**
 * Fills in whatever the flags didn't give. With `yes` every gap takes its default.
 * Without a TTY and without `yes`, missing answers are an error rather than a hang.
 */
export async function collectAnswers({ name, answers, yes }) {
  const out = { ...answers };
  const need = [];
  if (name === undefined) need.push('name');
  for (const key of ['template', 'packageManager', 'hardhat', 'web']) if (out[key] === undefined) need.push(key);

  if (need.length === 0) return { name, answers: out };
  if (yes) {
    return {
      name: name ?? 'redbelly-dapp',
      answers: { ...DEFAULTS, ...out },
    };
  }
  if (!stdin.isTTY) {
    throw new Error(`no terminal to ask for ${need.join(', ')}; pass --yes or the matching flags`);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    let projectName = name;
    while (projectName === undefined) {
      const v = (await rl.question('Project name (redbelly-dapp): ')).trim() || 'redbelly-dapp';
      try {
        validateName(v);
        projectName = v;
      } catch (error) {
        console.log(error.message);
      }
    }
    if (out.template === undefined) {
      const keys = Object.keys(TEMPLATES);
      console.log('Template:');
      keys.forEach((k, i) => console.log(`  ${i + 1}. ${k.padEnd(13)} ${TEMPLATES[k].label}`));
      out.template = await pick(rl, keys, DEFAULTS.template);
    }
    if (out.packageManager === undefined) {
      const keys = Object.keys(PACKAGE_MANAGERS);
      out.packageManager = await pick(rl, keys, DEFAULTS.packageManager, 'Package manager');
    }
    if (out.hardhat === undefined) out.hardhat = await yesNo(rl, 'Add a Hardhat 3 view of the same sources in hardhat/? (Foundry is the path; this is for teams that also use Hardhat)', DEFAULTS.hardhat);
    if (out.web === undefined) out.web = await yesNo(rl, 'Include the Next.js web app?', DEFAULTS.web);
    return { name: projectName, answers: out };
  } finally {
    rl.close();
  }
}

async function pick(rl, keys, fallback, label) {
  for (;;) {
    const prompt = label ? `${label} (${keys.join('/')}) [${fallback}]: ` : `Choose 1-${keys.length} or a name [${fallback}]: `;
    const raw = (await rl.question(prompt)).trim();
    if (raw === '') return fallback;
    if (/^\d+$/.test(raw) && keys[Number(raw) - 1]) return keys[Number(raw) - 1];
    if (keys.includes(raw)) return raw;
    console.log(`  one of: ${keys.join(', ')}`);
  }
}

async function yesNo(rl, question, fallback) {
  for (;;) {
    const raw = (await rl.question(`${question} (${fallback ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
    if (raw === '') return fallback;
    if (['y', 'yes'].includes(raw)) return true;
    if (['n', 'no'].includes(raw)) return false;
  }
}
