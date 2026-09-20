// Hardhat 3 configuration for __PROJECT_NAME__. Same compiler pins as ../contracts/foundry.toml.
// src/ and lib/ are links to ../contracts/src and ../contracts/lib, so both tools compile
// one set of files. Chain facts: https://vine.redbelly.network/environments/
import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  paths: {
    // src/ is the project's contracts. lib/receptor-mock/src is compiled too so the deploy
    // script has a ReceptorMock artifact for the first testnet deploy (never on mainnet).
    sources: ["./src", "./lib/receptor-mock/src"],
    tests: { solidity: "./src" }, // Foundry-style tests stay under ../contracts/test; run them with forge
  },
  solidity: {
    version: "0.8.30",
    settings: {
      evmVersion: "prague",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  // Routescan's Etherscan-style verification endpoints for `hardhat verify etherscan`. The
  // key is a fixed placeholder Routescan documents as accepted; it is not a secret.
  chainDescriptors: {
    153: {
      name: "Redbelly Network Testnet",
      blockExplorers: {
        etherscan: { name: "Routescan", url: "__TESTNET_EXPLORER__", apiUrl: "__TESTNET_EXPLORER_API__" },
      },
    },
    151: {
      name: "Redbelly Network Mainnet",
      blockExplorers: {
        etherscan: { name: "Routescan", url: "__MAINNET_EXPLORER__", apiUrl: "__MAINNET_EXPLORER_API__" },
      },
    },
  },
  verify: {
    etherscan: { apiKey: "verifyContract" },
  },
  networks: {
    // No key in this file. REDBELLY_DEPLOYER_KEY comes from Hardhat's encrypted keystore:
    //   npx hardhat keystore set REDBELLY_DEPLOYER_KEY
    // Hardhat would also read it from an environment variable of that name; don't do that
    // (shell history keeps it). For a hardware wallet, set accounts to "remote" and point
    // url at a local signer that exposes eth_accounts and eth_sendTransaction.
    redbellyTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 153,
      url: "__TESTNET_RPC__",
      accounts: [configVariable("REDBELLY_DEPLOYER_KEY")],
    },
    redbellyMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 151,
      url: "__MAINNET_RPC__",
      accounts: [configVariable("REDBELLY_DEPLOYER_KEY")],
    },
    // A local fork: anvil --fork-url https://governors.testnet.redbelly.network
    anvil: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      accounts: "remote",
    },
  },
});
