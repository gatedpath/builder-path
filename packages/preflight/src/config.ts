// Reads the target profile from foundry.toml or hardhat.config.* without executing anything.
// Foundry's TOML is parsed by a small reader that understands the subset Foundry projects use:
// [section] headers, dotted section names, `key = value` with strings, numbers, booleans and
// one-line arrays. Hardhat configs are JavaScript, so they are scanned with regular expressions
// after brace matching narrows the text to the chosen network block. Both readers are tolerant:
// what they cannot find they report as null, and the checks say so.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectConfig {
  kind: 'foundry' | 'hardhat' | 'none';
  file: string | null;
  profile: string | null;
  solc: string | null;
  evmVersion: string | null;
  optimizerRuns: number | null;
  /** foundry: `src`; hardhat: `contracts`. */
  sourceDir: string;
  /** foundry `chain_id` or the hardhat network's `chainId`. */
  chainId: number | null;
  /** foundry [rpc_endpoints] or hardhat networks' url values, by name. */
  rpcEndpoints: Record<string, string>;
  /** The RPC url of the chosen hardhat network, if any. */
  rpcUrl: string | null;
}

export const HARDHAT_CONFIG_NAMES = ['hardhat.config.ts', 'hardhat.config.js', 'hardhat.config.cjs', 'hardhat.config.mjs', 'hardhat.config.cts', 'hardhat.config.mts'];

export function readProjectConfig(project: string, profile?: string, env: NodeJS.ProcessEnv = process.env): ProjectConfig {
  const foundry = join(project, 'foundry.toml');
  if (existsSync(foundry)) return readFoundryConfig(foundry, profile ?? env['FOUNDRY_PROFILE'] ?? 'default');
  for (const name of HARDHAT_CONFIG_NAMES) {
    const file = join(project, name);
    if (existsSync(file)) return readHardhatConfig(file, profile ?? null);
  }
  return { kind: 'none', file: null, profile: null, solc: null, evmVersion: null, optimizerRuns: null, sourceDir: 'src', chainId: null, rpcEndpoints: {}, rpcUrl: null };
}

// ---------- Foundry ----------

type TomlValue = string | number | boolean | TomlValue[];
type TomlTable = Record<string, TomlValue>;

/** Enough TOML for foundry.toml: sections, dotted headers, scalars, one-line arrays, comments. */
export function parseToml(text: string): Record<string, TomlTable> {
  const out: Record<string, TomlTable> = {};
  let section = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (header) {
      section = header[1]!.replace(/\s+/g, '');
      out[section] ??= {};
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    out[section] ??= {};
    out[section]![kv[1]!] = parseTomlValue(kv[2]!.trim());
  }
  return out;
}

function stripComment(line: string): string {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inString) {
      if (c === inString) inString = null;
    } else if (c === '"' || c === "'") inString = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function parseTomlValue(raw: string): TomlValue {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner).map((v) => parseTomlValue(v.trim()));
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d[\d_]*$/.test(raw)) return Number(raw.replace(/_/g, ''));
  if (/^-?\d[\d_]*\.\d+$/.test(raw)) return Number(raw.replace(/_/g, ''));
  return raw;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let cur = '';
  for (const c of s) {
    if (inString) {
      cur += c;
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") inString = c;
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

export function readFoundryConfig(file: string, profile: string): ProjectConfig {
  const toml = parseToml(readFileSync(file, 'utf8'));
  const base = toml['profile.default'] ?? {};
  const chosen = toml[`profile.${profile}`] ?? {};
  const get = (key: string): TomlValue | undefined => chosen[key] ?? base[key];
  const str = (key: string): string | null => {
    const v = get(key);
    return typeof v === 'string' ? v : null;
  };
  const num = (key: string): number | null => {
    const v = get(key);
    return typeof v === 'number' ? v : null;
  };
  const rpcEndpoints: Record<string, string> = {};
  for (const [k, v] of Object.entries(toml['rpc_endpoints'] ?? {})) if (typeof v === 'string') rpcEndpoints[k] = expandEnv(v);
  return {
    kind: 'foundry',
    file,
    profile,
    solc: str('solc') ?? str('solc_version'),
    evmVersion: str('evm_version'),
    optimizerRuns: num('optimizer_runs'),
    sourceDir: str('src') ?? 'src',
    chainId: num('chain_id'),
    rpcEndpoints,
    rpcUrl: null,
  };
}

/** Foundry lets an endpoint be `${RPC_URL}`; expand from the environment when set. */
function expandEnv(v: string): string {
  return v.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => process.env[name] ?? `\${${name}}`);
}

// ---------- Hardhat ----------

export function readHardhatConfig(file: string, network: string | null): ProjectConfig {
  const text = readFileSync(file, 'utf8');
  const solidity = blockAfter(text, /\bsolidity\s*:/) ?? '';
  const versions = [...(solidity || text).matchAll(/\bversion\s*:\s*["']([\d.]+)["']/g)].map((m) => m[1]!);
  const shorthand = /\bsolidity\s*:\s*["']([\d.]+)["']/.exec(text);
  const solc = shorthand ? shorthand[1]! : versions.length === 1 ? versions[0]! : versions.length > 1 ? versions.join(',') : null;
  const evm = /\bevmVersion\s*:\s*["']([A-Za-z]+)["']/.exec(solidity || text);
  const runs = /\bruns\s*:\s*(\d+)/.exec(solidity || text);
  const networks = blockAfter(text, /\bnetworks\s*:/) ?? '';
  const rpcEndpoints: Record<string, string> = {};
  const chainIds: Record<string, number> = {};
  for (const m of networks.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{/g)) {
    const name = m[1]!;
    const body = blockAfter(networks.slice(m.index!), new RegExp(`\\b${name}\\s*:`)) ?? '';
    const url = /\burl\s*:\s*["'`]([^"'`]+)["'`]/.exec(body);
    const cid = /\bchainId\s*:\s*(\d+)/.exec(body);
    if (url) rpcEndpoints[name] = url[1]!;
    if (cid) chainIds[name] = Number(cid[1]);
  }
  const chosen = network ?? null;
  const contractsDir = /\bsources\s*:\s*["']([^"']+)["']/.exec(text);
  return {
    kind: 'hardhat',
    file,
    profile: chosen,
    solc,
    evmVersion: evm ? evm[1]! : null,
    optimizerRuns: runs ? Number(runs[1]) : null,
    sourceDir: contractsDir ? contractsDir[1]!.replace(/^\.\//, '') : 'contracts',
    chainId: chosen ? (chainIds[chosen] ?? null) : null,
    rpcEndpoints,
    rpcUrl: chosen ? (rpcEndpoints[chosen] ?? null) : null,
  };
}

/** Text of the `{ ... }` block that follows the first match of `key`, with braces balanced. */
function blockAfter(text: string, key: RegExp): string | null {
  const m = key.exec(text);
  if (!m) return null;
  const start = text.indexOf('{', m.index + m[0].length);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
