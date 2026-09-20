export const redbellyTestnet: ChainDefinition = {
  id: 153,
  name: 'Redbelly Network Testnet',
  nativeCurrency,
  rpcUrls: {
    default: { http: ['https://governors.testnet.redbelly.network'] },
    public: { http: ['https://governors.testnet.redbelly.network'] },
  },
  blockExplorers: {
    default: {
      name: 'Routescan',
      url: 'https://redbelly.testnet.routescan.io',
      apiUrl: 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan/api',
    },
  },
  contracts: {
    multicall3: { address: addresses.testnet.multicall3.address, blockCreated: 2823505 },
    permit2: { address: addresses.testnet.permit2.address },
    ...pick(addresses.testnet, sharedContractNames, { permission: 26, bootstrapRegistry: 0 }),
  },
  testnet: true,
};
