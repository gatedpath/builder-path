/** The provider list for a network, in the order they are tried. */
export function providersFor(network, { uniblockKey = process.env.UNIBLOCK_API_KEY } = {}) {
  if (network === 'mainnet' || network === 151) {
    const list = [
      { name: 'governors', url: redbellyMainnet.rpcUrls.default.http[0] },
      { name: 'ankr', url: redbellyMainnet.rpcUrls.public.http.find((u) => u.includes('ankr')) },
    ].filter((p) => p.url);
    if (uniblockKey) {
      list.push({ name: 'uniblock', url: keyedRpcs.mainnet.uniblock.url, headers: { [keyedRpcs.mainnet.uniblock.header]: uniblockKey } });
    }
    return list;
  }
  if (network === 'testnet' || network === 153) {
    return [{ name: 'governors', url: redbellyTestnet.rpcUrls.default.http[0] }];
  }
  throw new Error(`unknown network ${network}; use mainnet, testnet, 151 or 153`);
}
