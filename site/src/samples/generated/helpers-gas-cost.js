test('gasCostUsd reproduces the US$0.01 transfer at the measured base fee and price', async () => {
  const c = await gasCostUsd({ gasUsed: 21_000, rpc: fakeRpc() });
