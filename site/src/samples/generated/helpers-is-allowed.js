test('isAllowed encodes the address and decodes the bool', async () => {
  const rpc = fakeRpc();
  assert.equal(await isAllowed(knownAllowed.mainnet.address, { rpc }), true);
  assert.equal(await isAllowed('0x0000000000000000000000000000000000000000', { rpc }), false);
  assert.equal(await isAllowed('0x0000000000000000000000000000000000000000', { rpc, permission: addresses.mainnet.permission.address }), false);
  const direct = rpc.calls.filter(([m]) => m === 'eth_call');
  assert.equal(direct.at(-1)[1][0].data, selectors.isAllowed + '0'.repeat(64));
});
