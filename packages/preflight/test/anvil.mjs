// Spawns anvil, etches the Redbelly system-contract mocks and the real Safe 1.4.1 code at
// their canonical addresses, and deploys Safe proxies through the genuine factory. No key is
// used anywhere: transactions go through anvil's unlocked accounts via eth_sendTransaction.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addresses } from '@gatedpath/chains';
import { permissionMock, priceFeedMock, registryMock } from './mocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures', 'safe-1.4.1');

export const SAFE = {
  singleton: addresses.mainnet.safeSingleton.address,
  l2Singleton: addresses.mainnet.safeL2Singleton.address,
  proxyFactory: addresses.mainnet.safeProxyFactory.address,
  fallbackHandler: addresses.mainnet.safeFallbackHandler.address,
};

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export function rpcCaller(url) {
  let id = 1;
  return async (method, params = []) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  };
}

export async function startAnvil(chainId) {
  const port = await freePort();
  const child = spawn('anvil', ['--chain-id', String(chainId), '--port', String(port), '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const url = `http://127.0.0.1:${port}`;
  const rpc = rpcCaller(url);
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`anvil exited ${child.exitCode}: ${stderr}`);
    try {
      const id = Number(BigInt(await rpc('eth_chainId')));
      if (id === chainId) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`anvil did not answer on ${url} within 20s: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const accounts = await rpc('eth_accounts');
  return {
    url,
    rpc,
    chainId,
    accounts,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }),
  };
}

const pad32 = (hex) => '0x' + hex.replace(/^0x/, '').padStart(64, '0');

/** Etch registry, permission and price feed mocks at the addresses chain-definitions records for this chain. */
export async function installRedbellyMocks(anvil) {
  const net = anvil.chainId === 151 ? 'mainnet' : 'testnet';
  const a = addresses[net];
  const permission = a.permission.address;
  const pricefeed = a.pricefeed.address;
  const gasfees = a.gasfees.address;
  await anvil.rpc('anvil_setCode', [a.bootstrapRegistry.address, registryMock({ permission, pricefeed, gasfees })]);
  await anvil.rpc('anvil_setCode', [permission, permissionMock()]);
  await anvil.rpc('anvil_setCode', [pricefeed, priceFeedMock(2431)]);
  return { registry: a.bootstrapRegistry.address, permission, pricefeed };
}

export async function allow(anvil, permission, wallet, allowed = true) {
  await anvil.rpc('anvil_setStorageAt', [permission, pad32(wallet), pad32(allowed ? '1' : '0')]);
}

export async function installSafe(anvil) {
  const code = (name) => readFileSync(join(fixtures, name), 'utf8').trim();
  await anvil.rpc('anvil_setCode', [SAFE.singleton, code('safe-singleton.hex')]);
  await anvil.rpc('anvil_setCode', [SAFE.l2Singleton, code('safe-l2-singleton.hex')]);
  await anvil.rpc('anvil_setCode', [SAFE.proxyFactory, code('safe-proxy-factory.hex')]);
  await anvil.rpc('anvil_setCode', [SAFE.fallbackHandler, code('compatibility-fallback-handler.hex')]);
}

// Minimal ABI encoding for the two calls below.
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const addrWord = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const SETUP = 'b63e800d'; // setup(address[],uint256,address,bytes,address,address,uint256,address)
const CREATE_PROXY_WITH_NONCE = '1688f0b9'; // createProxyWithNonce(address,bytes,uint256)
const PROXY_CREATION_TOPIC = '0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235'; // ProxyCreation(address,address)

export function encodeSetup(owners, threshold, fallbackHandler) {
  const ZERO = '0x' + '0'.repeat(40);
  const ownersOffset = 8 * 32;
  const dataOffset = ownersOffset + 32 * (1 + owners.length);
  let out = SETUP;
  out += word(ownersOffset) + word(threshold) + addrWord(ZERO) + word(dataOffset) + addrWord(fallbackHandler) + addrWord(ZERO) + word(0) + addrWord(ZERO);
  out += word(owners.length) + owners.map(addrWord).join('');
  out += word(0); // empty bytes
  return '0x' + out;
}

export function encodeCreateProxyWithNonce(singleton, initializer, nonce) {
  const init = initializer.replace(/^0x/, '');
  const len = init.length / 2;
  const padded = init.padEnd(Math.ceil(len / 32) * 64, '0');
  return '0x' + CREATE_PROXY_WITH_NONCE + addrWord(singleton) + word(0x60) + word(nonce) + word(len) + padded;
}

/** Deploys a real Safe 1.4.1 proxy and returns its address. */
export async function deploySafe(anvil, { owners, threshold, nonce = 1, singleton = SAFE.singleton }) {
  const data = encodeCreateProxyWithNonce(singleton, encodeSetup(owners, threshold, SAFE.fallbackHandler), nonce);
  const hash = await anvil.rpc('eth_sendTransaction', [{ from: anvil.accounts[0], to: SAFE.proxyFactory, data, gas: '0x2dc6c0' }]);
  let receipt = null;
  for (let i = 0; i < 100 && !receipt; i++) {
    receipt = await anvil.rpc('eth_getTransactionReceipt', [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 50));
  }
  if (!receipt || receipt.status !== '0x1') throw new Error(`Safe proxy creation failed: ${JSON.stringify(receipt)}`);
  const log = receipt.logs.find((l) => l.topics[0] === PROXY_CREATION_TOPIC);
  if (!log) throw new Error('no ProxyCreation log');
  return '0x' + log.topics[1].slice(-40);
}
