// Shared shapes. A check never throws for a "no" answer; it returns a result with a status
// and one sentence saying why. Only a bug throws.

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export type CheckId =
  | 'chain-id'
  | 'deployer-verified'
  | 'admin-safe'
  | 'compiler-pins'
  | 'git-secrets'
  | 'balance'
  | 'slither-report';

export interface CheckResult {
  readonly id: CheckId;
  readonly status: CheckStatus;
  /** One sentence. Printed after the status on the terminal and copied into the JSON. */
  readonly reason: string;
  /** Machine-readable detail. Never contains a secret. */
  readonly data?: Record<string, unknown>;
}

export interface PreflightOptions {
  /** Project directory holding foundry.toml or hardhat.config.*. Default: cwd. */
  project?: string;
  /** Foundry profile or Hardhat network name to read. Default: Foundry `default`, Hardhat: the network whose chainId matches. */
  profile?: string;
  /** Target chain. Default: whatever the RPC reports, checked against config. */
  chain?: 151 | 153;
  /** JSON-RPC URL. Default: the governors endpoint for `chain`. */
  rpc?: string;
  /** Foundry keystore account name; resolved with `cast wallet address --account`. */
  account?: string;
  /** Deployer address for a read-only run. */
  address?: string;
  /** Admin or owner address the deployed contracts will hand control to. */
  admin?: string;
  /** Gas the deployment is expected to burn. Default 3,000,000. */
  gas?: number | bigint;
  /** Slither report path. Default: reports/slither.json or reports/slither.md under the project. */
  slitherReport?: string;
  /** Check ids to skip. */
  skip?: readonly CheckId[];
  /** Registry, permission and price feed overrides for local chains. Tests use these. */
  registry?: string;
  /** Working directory for `cast`. Default: project. */
  env?: NodeJS.ProcessEnv;
}

export interface PreflightReport {
  readonly tool: 'redbelly-preflight';
  readonly version: string;
  readonly generatedAt: string;
  readonly project: string;
  readonly config: { kind: 'foundry' | 'hardhat' | 'none'; file: string | null; profile: string | null };
  readonly chain: { expected: number | null; reported: number | null; rpc: string; network: 'mainnet' | 'testnet' | 'unknown' };
  readonly deployer: string | null;
  readonly admin: string | null;
  readonly checks: readonly CheckResult[];
  /**
   * True when no check failed and the run checked something. A check skipped because it does not
   * apply is neutral. A check skipped ON REQUEST is neutral on testnet, and makes this false on
   * chain 151 or when the chain check itself, or every check, was skipped: "ok" must never mean
   * "nothing was looked at".
   */
  readonly ok: boolean;
  /** How many checks `--skip` removed. */
  readonly skippedOnRequest: number;
}
