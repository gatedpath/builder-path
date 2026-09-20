// Temporary project directories for the tests: a foundry.toml or hardhat config, a source
// file, optionally a git history and a Slither report. Commit times are pinned through
// GIT_AUTHOR_DATE / GIT_COMMITTER_DATE so "newer than" is deterministic.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeProject({ solc = '0.8.30', evm = 'prague', chainId = null, hardhat = false, git = true, slither = 'after', files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
  mkdirSync(join(dir, hardhat ? 'contracts' : 'src'), { recursive: true });
  if (hardhat) {
    writeFileSync(join(dir, 'hardhat.config.ts'), `import { HardhatUserConfig } from "hardhat/config";
const config: HardhatUserConfig = {
  solidity: { version: "${solc}", settings: { evmVersion: "${evm}", optimizer: { enabled: true, runs: 200 } } },
  networks: {
    redbellyTestnet: { url: "https://governors.testnet.redbelly.network", chainId: 153 },
    redbellyMainnet: { url: "https://governors.mainnet.redbelly.network", chainId: 151 },
  },
};
export default config;
`);
  } else {
    writeFileSync(join(dir, 'foundry.toml'), `[profile.default]\nsrc = "src"\nsolc_version = "${solc}"\nevm_version = "${evm}"\noptimizer_runs = 200\n${chainId ? `chain_id = ${chainId}\n` : ''}\n[profile.ci]\nfuzz = { runs = 1000 }\n\n[rpc_endpoints]\nredbelly_testnet = "https://governors.testnet.redbelly.network"\n`);
  }
  writeFileSync(join(dir, hardhat ? 'contracts' : 'src', 'A.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract A {}\n');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  if (git) {
    gitInit(dir);
    commit(dir, 'sources', '2026-09-10T10:00:00Z');
  }
  if (slither) {
    mkdirSync(join(dir, 'reports'), { recursive: true });
    writeFileSync(join(dir, 'reports', 'slither.json'), '{"success":true,"results":{"detectors":[]}}\n');
    if (git) commit(dir, 'slither report', slither === 'after' ? '2026-09-11T10:00:00Z' : '2026-09-09T10:00:00Z');
  }
  return dir;
}

export function gitInit(dir) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'preflight tests'], { cwd: dir });
}

export function commit(dir, message, isoDate) {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } });
}
