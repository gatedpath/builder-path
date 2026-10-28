import type { ProjectConfig } from '../config.js';
import type { CheckResult } from '../types.js';

export const SOLC_PIN = '0.8.30';
export const EVM_PIN = 'prague';

export function checkCompilerPins(config: ProjectConfig): CheckResult {
  if (config.kind === 'none') return { id: 'compiler-pins', status: 'fail', reason: 'No foundry.toml or hardhat.config.* found, so the compiler and EVM pins cannot be confirmed.' };
  const where = `${config.file}${config.profile ? ` (${config.kind === 'foundry' ? 'profile' : 'network'} ${config.profile})` : ''}`;
  const data = { solc: config.solc, evmVersion: config.evmVersion, file: config.file, profile: config.profile };
  const problems: string[] = [];
  // A project that vendors a suite with its own compiler (ERC-3643's reference contracts pin 0.8.17, which
  // knows neither prague nor cancun) can only build with solc detected per file. The pin then lives in each
  // file's pragma, which this check does not read, so it warns instead of failing (card 15, 17 October 2026).
  if (config.kind === 'foundry' && config.solc === null && config.autoDetectSolc) {
    const evmOk = config.evmVersion !== null && config.evmVersion.toLowerCase() === EVM_PIN;
    return { id: 'compiler-pins', status: evmOk ? 'warn' : 'fail', reason: evmOk
      ? `${where} detects solc per file (auto_detect_solc = true) and sets EVM ${EVM_PIN}. The pin is not in the config: your own files must say pragma solidity ${SOLC_PIN}; a vendored dependency may compile with its own solc for the newest EVM it knows.`
      : `${where} detects solc per file but ${config.evmVersion === null ? 'sets no evm_version' : `sets evm version ${config.evmVersion}, not ${EVM_PIN}`}; Redbelly is Prague.`, data };
  }
  if (config.solc === null) problems.push(`no ${config.kind === 'foundry' ? 'solc_version' : 'solidity version'} is pinned`);
  else if (config.solc !== SOLC_PIN) problems.push(`solc is ${config.solc}, not ${SOLC_PIN}`);
  if (config.evmVersion === null) problems.push(`no ${config.kind === 'foundry' ? 'evm_version' : 'evmVersion'} is set`);
  else if (config.evmVersion.toLowerCase() !== EVM_PIN) problems.push(`evm version is ${config.evmVersion}, not ${EVM_PIN}`);
  if (problems.length > 0) return { id: 'compiler-pins', status: 'fail', reason: `In ${where}, ${problems.join(' and ')}; Redbelly is Prague with solc ${SOLC_PIN} on both networks (verified 2026-09-12).`, data };
  return { id: 'compiler-pins', status: 'pass', reason: `${where} pins solc ${SOLC_PIN} and EVM ${EVM_PIN}.`, data };
}
