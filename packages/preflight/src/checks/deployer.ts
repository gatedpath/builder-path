// Who deploys, and may they? The address comes from `cast wallet address --account NAME`
// (cast decrypts the keystore locally; this process only sees the address) or from
// --address for a read-only run. Never from a key.
import { isAllowed } from '@gatedpath/chains';
import { ACCOUNT_NAME, run } from '../proc.js';
import { isWellKnownDevAccount } from '../well-known.js';
import type { CheckResult } from '../types.js';

export interface DeployerSource {
  account?: string | undefined;
  address?: string | undefined;
  passwordFile?: string | undefined;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export async function resolveDeployer(src: DeployerSource): Promise<{ address: string | null; how: string; error?: string }> {
  if (src.address) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(src.address)) return { address: null, how: '--address', error: `"${src.address}" is not a 20-byte hex address.` };
    return { address: src.address, how: '--address' };
  }
  if (src.account) {
    if (!ACCOUNT_NAME.test(src.account)) return { address: null, how: '--account', error: 'Keystore names may only use letters, digits, dot, dash and underscore.' };
    const args = ['wallet', 'address', '--account', src.account];
    if (src.passwordFile) args.push('--password-file', src.passwordFile);
    const r = await run('cast', args, { cwd: src.cwd, env: src.env, timeoutMs: 60_000, stdin: '' });
    if (r.spawnError) return { address: null, how: '--account', error: `cast is not installed or not on PATH (${r.spawnError}); install Foundry or pass --address for a read-only run.` };
    const m = /0x[0-9a-fA-F]{40}/.exec(r.stdout);
    if (r.code !== 0 || !m) return { address: null, how: '--account', error: `cast wallet address --account ${src.account} failed: ${(r.stderr || r.stdout).trim().split('\n').pop() ?? 'no output'}.` };
    return { address: m[0], how: `cast wallet address --account ${src.account}` };
  }
  return { address: null, how: 'none' };
}

export async function checkDeployerVerified(address: string | null, how: string, error: string | undefined, rpc: string, chain: number | null): Promise<CheckResult> {
  if (error) return { id: 'deployer-verified', status: 'fail', reason: error };
  if (!address) return { id: 'deployer-verified', status: 'skip', reason: 'No deployer given; pass --account <keystore-name> or --address <0x…>.' };
  if (chain !== 151 && chain !== 153) return { id: 'deployer-verified', status: 'skip', reason: 'The RPC is not a Redbelly chain, so there is no permission contract to ask.', data: { address } };
  try {
    const allowed = await isAllowed(address, { rpc });
    if (isWellKnownDevAccount(address)) {
      return {
        id: 'deployer-verified',
        // Anyone can sign as this account. On mainnet that is a refusal, and so is failing isAllowed
        // anywhere; a warning is only right on testnet when the account does pass.
        status: chain === 151 || !allowed ? 'fail' : 'warn',
        reason: `${address} (${how}) is one of the ten anvil/Hardhat default accounts whose private keys are public; it ${allowed ? 'passes' : 'fails'} isAllowed on chain ${chain}, but a deploy from it runs under an identity you do not control (RESEARCH.md question 30). Use a keystore of your own.`,
        data: { address, allowed, how, wellKnownDevAccount: true },
      };
    }
    if (allowed) return { id: 'deployer-verified', status: 'pass', reason: `${address} (${how}) passes permission.isAllowed on chain ${chain}.`, data: { address, allowed, how } };
    return { id: 'deployer-verified', status: 'fail', reason: `${address} (${how}) fails permission.isAllowed on chain ${chain}; verify it at https://access.redbelly.network before deploying.`, data: { address, allowed, how } };
  } catch (e) {
    return { id: 'deployer-verified', status: 'fail', reason: `Could not read permission.isAllowed: ${(e as Error).message}.`, data: { address, how } };
  }
}
