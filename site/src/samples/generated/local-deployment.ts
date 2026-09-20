/**
 * `deployments/local.json` as `scripts/dev.mjs` writes it in a scaffold (PLAN.md 18.1). `deployer`
 * is Anvil account 7, the account that deployed the mock and holds the contract's admin roles; the
 * panel impersonates it to call `setStatus`. Accounts 0 and 1 are never used (RESEARCH.md 30).
 */
export interface LocalDeployment {
  chainId: number;
  forkOf: 151 | 153 | null;
  verifier: Address;
  contract: Address;
  requestId: number;
  deployer: { index: number; address: Address };
