import type { ProjectConfig } from '../config.js';
import type { CheckResult } from '../types.js';

export const SOLC_PIN = '0.8.30';
export const EVM_PIN = 'prague';

export function checkCompilerPins(config: ProjectConfig): CheckResult {
  if (config.kind === 'none') return { id: 'compiler-pins', status: 'fail', reason: 'No foundry.toml or hardhat.config.* found, so the compiler and EVM pins cannot be confirmed.' };
  const where = `${config.file}${config.profile ? ` (${config.kind === 'foundry' ? 'profile' : 'network'} ${config.profile})` : ''}`;
  const data = { solc: config.solc, evmVersion: config.evmVersion, file: config.file, profile: config.profile };
  const problems: string[] = [];
  if (config.solc === null) problems.push(`no ${config.kind === 'foundry' ? 'solc_version' : 'solidity version'} is pinned`);
  else if (config.solc !== SOLC_PIN) problems.push(`solc is ${config.solc}, not ${SOLC_PIN}`);
  if (config.evmVersion === null) problems.push(`no ${config.kind === 'foundry' ? 'evm_version' : 'evmVersion'} is set`);
  else if (config.evmVersion.toLowerCase() !== EVM_PIN) problems.push(`evm version is ${config.evmVersion}, not ${EVM_PIN}`);
  if (problems.length > 0) return { id: 'compiler-pins', status: 'fail', reason: `In ${where}, ${problems.join(' and ')}; Redbelly is Prague with solc ${SOLC_PIN} on both networks (verified 2026-09-12).`, data };
  return { id: 'compiler-pins', status: 'pass', reason: `${where} pins solc ${SOLC_PIN} and EVM ${EVM_PIN}.`, data };
}
