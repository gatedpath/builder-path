// Hardhat build of the same contracts with the same pins as foundry.toml: solc 0.8.30, EVM Prague.
// The project root is the package root, so there is one copy of the contracts (src/) and one
// node_modules for OpenZeppelin; only the cache and artifacts land in this folder. Hardhat 2.29.1
// (the `hh2` line), matching the Hardhat material on Vine and Redbelly's archived verifier example.
const path = require("path");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "prague",
    },
  },
  paths: {
    root: path.join(__dirname, ".."),
    sources: "src",
    tests: "hardhat/test",
    cache: "hardhat/cache",
    artifacts: "hardhat/artifacts",
  },
  networks: {
    // No accounts here on purpose. Signing goes through a Foundry keystore or a hardware
    // wallet on the builder's machine; see the project CLAUDE.md.
    redbellyTestnet: { url: "https://governors.testnet.redbelly.network", chainId: 153 },
    redbellyMainnet: { url: "https://governors.mainnet.redbelly.network", chainId: 151 },
  },
};
