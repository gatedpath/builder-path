export const redbellyMainnet: ChainDefinition = {
  id: 151,
  name: 'Redbelly Network Mainnet',
  nativeCurrency,
  rpcUrls: {
    default: { http: ['https://governors.mainnet.redbelly.network'] },
    public: { http: ['https://governors.mainnet.redbelly.network', 'https://rpc.ankr.com/redbelly_mainnet'] },
  },
  blockExplorers: {
    default: {
      name: 'Routescan',
      url: 'https://redbelly.routescan.io',
      apiUrl: 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan/api',
    },
  },
  contracts: {
    multicall3: { address: addresses.mainnet.multicall3.address, blockCreated: 2714761 },
    ...pick(addresses.mainnet, sharedContractNames, { permission: 25, bootstrapRegistry: 0 }),
  },
  testnet: false,
};
