// Hardhat deploy path. It runs the same refusals as ../contracts/script/Deploy.s.sol: reads
// the chain id from the RPC, requires ADMIN_SAFE to be a Safe 1.4.1 with threshold >= 2 on
// 151, and requires the deployer to pass permission.isAllowed. The signer comes from the
// Hardhat keystore (REDBELLY_DEPLOYER_KEY), never from this file.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";
import { getAddress, keccak256, parseAbi, toHex } from "viem";

const MAINNET = 151n;
const TESTNET = 153n;
// Addresses below are filled in by the scaffolder from @gatedpath/chains (verified __FACTS_VERIFIED_ON__).
const BOOTSTRAP_REGISTRY = "__BOOTSTRAP_REGISTRY__";
const SAFE_SINGLETONS = new Set([
  "__SAFE_SINGLETON__", // Safe 1.4.1
  "__SAFE_L2_SINGLETON__", // SafeL2 1.4.1
]);

const registryAbi = parseAbi(["function getContractAddress(string name) view returns (address)"]);
const permissionAbi = parseAbi(["function isAllowed(address wallet) view returns (bool)"]);
const safeAbi = parseAbi([
  "function VERSION() view returns (string)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
]);
// The runtime code of a SafeProxy 1.4.1 (171 bytes, the same on every chain); the scaffolder's test
// fixtures say how it was derived. The admin's own code is compared with it, not its answers.
const SAFE_PROXY_141_RUNTIME = "0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const chainId = BigInt(await publicClient.getChainId());
  const deployer = wallet.account.address;
  console.log(`chain id (from the RPC): ${chainId}`);
  console.log(`deployer: ${deployer}`);

  if (chainId === MAINNET || chainId === TESTNET) {
    const code = await publicClient.getCode({ address: BOOTSTRAP_REGISTRY });
    if (!code || code === "0x") throw new Error("bootstrap registry has no code: this RPC is not a Redbelly network");
    const permission = await publicClient.readContract({ address: BOOTSTRAP_REGISTRY, abi: registryAbi, functionName: "getContractAddress", args: ["permission"] });
    const allowed = await publicClient.readContract({ address: permission, abi: permissionAbi, functionName: "isAllowed", args: [deployer] });
    if (!allowed) throw new Error("deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network");
    console.log("permission.isAllowed(deployer): true");
  } else {
    console.log("chain is not 151 or 153: identity check skipped");
  }

  let admin = process.env.ADMIN_SAFE ? getAddress(process.env.ADMIN_SAFE) : undefined;
  if (chainId === MAINNET) {
    if (!admin) throw new Error("mainnet needs ADMIN_SAFE, the address of a Safe 1.4.1 with threshold >= 2");
    const code = await publicClient.getCode({ address: admin });
    if (!code || code === "0x") throw new Error("ADMIN_SAFE is not a contract (an EOA cannot be the mainnet admin)");
    // A contract can answer VERSION() and masterCopy() any way it likes, so look at what it is: a
    // SafeProxy by code hash, whose storage slot 0 holds a canonical singleton (audit of 2026-09-19).
    const slot0 = await publicClient.getStorageAt({ address: admin, slot: "0x0" });
    const singleton = getAddress(`0x${(slot0 ?? "0x").slice(-40).padStart(40, "0")}`);
    if (code.toLowerCase() !== SAFE_PROXY_141_RUNTIME || !SAFE_SINGLETONS.has(singleton)) throw new Error("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton");
    const version = await publicClient.readContract({ address: admin, abi: safeAbi, functionName: "VERSION" });
    if (version !== "1.4.1") throw new Error("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton");
    const threshold = await publicClient.readContract({ address: admin, abi: safeAbi, functionName: "getThreshold" });
    if (threshold < 2n) throw new Error("ADMIN_SAFE threshold must be at least 2");
    const owners = await publicClient.readContract({ address: admin, abi: safeAbi, functionName: "getOwners" });
    if (BigInt(owners.length) < threshold) throw new Error("ADMIN_SAFE has fewer owners than its threshold");
    console.log(`ADMIN_SAFE is a Safe 1.4.1 with threshold ${threshold}`);
  } else if (!admin) {
    admin = deployer;
    console.log("ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.");
  }

  // The ship report gate (PLAN.md 18.3): `redbelly ship` writes contracts/deployments/ship-<chain>-<date>.md
  // only when every check passed; mainnet refuses to deploy without today's, testnet warns.
  const today = new Date().toISOString().slice(0, 10);
  const shipReport = [join("..", "contracts", "deployments", `ship-${chainId}-${today}.md`), join("deployments", `ship-${chainId}-${today}.md`)].find((p) => existsSync(p));
  if (shipReport) {
    // The first line is `<!-- redbelly-ship chain=<id> date=<YYYY-MM-DD> ok=<bool> ... -->`. A file that
    // merely exists proves nothing: an empty one or a renamed testnet report used to pass (audit of 2026-09-19).
    const header = readFileSync(shipReport, "utf8").split("\n", 1)[0];
    const good = header.startsWith("<!-- redbelly-ship ") && header.includes(` chain=${chainId} `) && header.includes(` date=${today} `) && header.includes(" ok=true ");
    if (!good && chainId === MAINNET) throw new Error("the ship report for chain 151 does not say chain=151, today's date and ok=true");
    if (!good) console.log(`the ship report at ${shipReport} is not a passing report for this chain dated today`);
  }
  if (chainId === MAINNET && !shipReport) throw new Error("no ship report dated today for chain 151: run redbelly ship first");
  if (chainId === TESTNET && !shipReport) console.log(`no ship report dated today for chain 153 (fine on testnet; mainnet refuses without one). redbelly ship --chain 153 --account <keystore-name> writes it.`);
  if (shipReport) console.log(`ship report: ${shipReport}`);

  let verifier = process.env.VERIFIER ? getAddress(process.env.VERIFIER) : undefined;
  const requestId = BigInt(process.env.REQUEST_ID ?? "18"); // 18 = the over-18 recipe (recipes/over-18); AU wholesale is 708
  if (!verifier) {
    if (chainId === MAINNET) throw new Error("VERIFIER is not set; mainnet never deploys a mock verifier");
    console.log("VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.");
    const mock = await viem.deployContract("ReceptorMock");
    verifier = mock.address;
  }

{{#if gatedErc20}}
  // Every role to the admin; the contract kit's docs/admin-pattern.md says how to split them for mainnet.
  const roles = { admin, pauser: admin, compliance: admin, issuerAdmin: admin };
  const token = await viem.deployContract("GatedERC20", ["Gated Token", "GTOK", roles, verifier, requestId, 100n * 10n ** 18n]);
  console.log(`GatedERC20: ${token.address}`);
{{/if}}
{{#if empty}}
  const example = await viem.deployContract("GatedExample", [admin, verifier, requestId]);
  console.log(`GatedExample: ${example.address}`);
{{/if}}
  console.log(`verifier: ${verifier}`);
  console.log(`record hash (chain, deployer, admin): ${keccak256(toHex(`${chainId}:${deployer}:${admin}`))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
