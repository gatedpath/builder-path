#!/usr/bin/env node
// Is the source at an address verified on Routescan, and does it say what you expect?
//   node scripts/routescan-verified.mjs 0xContract --network mainnet [--expect-name GatedERC20] [--expect-compiler 0.8.30] [--json]
// Exit 0 when verified (and every --expect matches), 1 when not verified or a mismatch, 2 on usage.
import { createRoutescan } from '../src/routescan.mjs';
import { networkFrom, parseFlags, requireAddress, usage } from '../src/cli.mjs';

const SPEC = {
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'which Redbelly network' },
  'expect-name': { hint: 'ContractName', help: 'fail unless the verified name matches' },
  'expect-compiler': { hint: '0.8.30', help: 'fail unless the compiler version contains this' },
  'expect-evm': { hint: 'prague', help: 'fail unless the EVM version matches (Routescan reports it when the verifier recorded it)' },
  json: { boolean: true, help: 'print JSON instead of prose' },
};

async function main(argv) {
  const { flags, positional } = parseFlags(argv, SPEC);
  if (flags.help || positional.length !== 1) {
    console.log(usage('redbelly-routescan-verified', 'verified-source check on Routescan', SPEC, '<contract-address>'));
    return positional.length === 1 ? 0 : 2;
  }
  const address = requireAddress(positional[0], 'contract address');
  const network = networkFrom(flags);
  const rs = createRoutescan(network);
  const info = await rs.verifiedSource(address);
  const problems = [];
  if (!info.verified) problems.push('source is not verified on Routescan');
  if (info.verified && flags['expect-name'] && info.name !== flags['expect-name']) problems.push(`name is ${info.name}, expected ${flags['expect-name']}`);
  if (info.verified && flags['expect-compiler'] && !String(info.compiler).includes(flags['expect-compiler'])) problems.push(`compiler is ${info.compiler}, expected ${flags['expect-compiler']}`);
  if (info.verified && flags['expect-evm'] && String(info.evmVersion).toLowerCase() !== String(flags['expect-evm']).toLowerCase()) problems.push(`evm version is ${info.evmVersion}, expected ${flags['expect-evm']}`);
  if (flags.json) {
    console.log(JSON.stringify({ network, ...info, problems }, null, 2));
  } else if (info.verified) {
    console.log(`${address} on ${network}: verified as ${info.name} (${info.compiler}, evm ${info.evmVersion ?? 'not recorded'}, optimizer ${info.optimization ? `${info.optimization.runs} runs` : 'off'}${info.proxy ? `, proxy to ${info.proxy}` : ''})\n${info.url}`);
    for (const p of problems) console.log(`MISMATCH: ${p}`);
  } else {
    console.log(`${address} on ${network}: NOT verified on Routescan. ${info.url}\nVerify with the recipe in packages/mcp (verify_routescan) or forge verify-contract; RESEARCH.md question 28.`);
  }
  return problems.length ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
