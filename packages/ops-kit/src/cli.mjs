// Shared argument handling for the scripts. No dependencies.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Whether the module at `metaUrl` is the script node was started with. Compares real paths as URLs:
 * npm installs a bin as a symlink, and a folder with a space in its name is %20 in a URL. Comparing
 * strings fails in both cases, silently, and a monitor that starts and does nothing is the worst
 * kind of broken.
 */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
export function parseFlags(argv, spec) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const def = spec[key];
      if (!def) throw new Error(`unknown flag --${key}`);
      if (def.boolean) {
        flags[key] = true;
        continue;
      }
      const value = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      flags[key] = def.number ? Number(value) : value;
      continue;
    }
    positional.push(a);
  }
  for (const [key, def] of Object.entries(spec)) {
    if (flags[key] === undefined && def.default !== undefined) flags[key] = def.default;
  }
  return { flags, positional };
}

export function usage(name, description, spec, positionalHelp = '') {
  const lines = Object.entries(spec).map(([k, d]) => `  --${k}${d.boolean ? '' : ' <' + (d.hint ?? 'value') + '>'}`.padEnd(30) + (d.help ?? '') + (d.default !== undefined ? ` (default ${d.default})` : ''));
  return `${name}: ${description}\n\nUsage\n  ${name} ${positionalHelp} [flags]\n\nFlags\n${lines.join('\n')}\n`;
}

export function requireAddress(value, what) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${what} must be a 0x address (40 hex characters); got ${JSON.stringify(value)}`);
  }
  return value;
}

export function networkFrom(flags) {
  const n = String(flags.network ?? 'testnet');
  if (['mainnet', '151'].includes(n)) return 'mainnet';
  if (['testnet', '153'].includes(n)) return 'testnet';
  throw new Error(`--network must be mainnet, testnet, 151 or 153; got ${n}`);
}

export function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => cells.map((v, i) => String(v ?? '').padEnd(widths[i])).join('  ');
  return [line(columns), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(columns.map((c) => r[c])))].join('\n');
}

export const jsonReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
