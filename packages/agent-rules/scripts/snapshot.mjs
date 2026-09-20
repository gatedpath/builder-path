// Shared by the sync script and the tests: the exact shape agent-rules keeps from
// @gatedpath/chains. Keep it small; the rules files link to the package for the rest.
export function snapshotFromChains(chains) {
  const { redbellyMainnet, redbellyTestnet, addresses, keyedRpcs, agentNotes } = chains;
  const book = (net) => Object.fromEntries(
    Object.entries(addresses[net]).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, e]) => [name, { address: e.address, verifiedOn: e.verifiedOn }]),
  );
  const chain = (c, net) => ({
    id: c.id,
    name: c.name,
    rpc: c.rpcUrls.default.http[0],
    publicRpcs: [...c.rpcUrls.public.http],
    explorer: { name: c.blockExplorers.default.name, url: c.blockExplorers.default.url, apiUrl: c.blockExplorers.default.apiUrl },
    addresses: book(net),
  });
  return {
    verifiedOn: addresses.mainnet.bootstrapRegistry.verifiedOn,
    nativeCurrency: { ...redbellyMainnet.nativeCurrency },
    mainnet: chain(redbellyMainnet, 'mainnet'),
    testnet: chain(redbellyTestnet, 'testnet'),
    keyedRpcs: { mainnet: { uniblock: { url: keyedRpcs.mainnet.uniblock.url, header: keyedRpcs.mainnet.uniblock.header } } },
    agentNotes,
  };
}
