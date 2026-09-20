// Hand-assembled runtime bytecode for the three Redbelly system contracts pre-flight reads,
// so the Anvil tests exercise the real helpers (registry lookup, isAllowed, price feed)
// without a Solidity compiler. Each contract is a few dozen bytes; see the comments.
const OP = { STOP: 0x00, EQ: 0x14, SHR: 0x1c, CALLDATALOAD: 0x35, TIMESTAMP: 0x42, POP: 0x50, MSTORE: 0x52, SLOAD: 0x54, JUMPI: 0x57, JUMPDEST: 0x5b, PUSH1: 0x60, PUSH2: 0x61, PUSH4: 0x63, PUSH20: 0x73, DUP1: 0x80, RETURN: 0xf3, REVERT: 0xfd };

function push(bytes) {
  return [0x60 + bytes.length - 1, ...bytes];
}
function hexBytes(hex) {
  const h = hex.replace(/^0x/, '');
  return Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}
function toHex(bytes) {
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** `[JUMPDEST, PUSH20 addr, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN]`: return one address word. */
function returnAddress(addr) {
  return [OP.JUMPDEST, ...push(hexBytes(addr)), ...push([0]), OP.MSTORE, ...push([0x20]), ...push([0]), OP.RETURN];
}

/**
 * Permission mock: `isAllowed(address)` returns storage[address]. Allow a wallet with
 * `anvil_setStorageAt(permission, pad32(wallet), pad32(1))`.
 */
export function permissionMock() {
  return toHex([...push([0x04]), OP.CALLDATALOAD, OP.SLOAD, ...push([0]), OP.MSTORE, ...push([0x20]), ...push([0]), OP.RETURN]);
}

/**
 * Bootstrap registry mock: `getContractAddress(string)` dispatches on the string's length,
 * which is enough to tell "permission" (10), "pricefeed" (9) and "gasfees" (7) apart.
 * Unknown names return the zero address, as the real testnet registry does.
 */
export function registryMock({ permission, pricefeed, gasfees }) {
  // PUSH1 0x24 CALLDATALOAD -> string length (offset word at 0x04 is 0x20, so length sits at 0x24)
  const head = [...push([0x24]), OP.CALLDATALOAD];
  const dispatch = (len, target) => [OP.DUP1, ...push([len]), OP.EQ, ...push([target]), OP.JUMPI];
  const fallthrough = [...push([0]), ...push([0]), OP.MSTORE, ...push([0x20]), ...push([0]), OP.RETURN];
  const dispatchLen = 7 * 3;
  const base = head.length + dispatchLen + fallthrough.length;
  const permBlock = returnAddress(permission);
  const feedBlock = returnAddress(pricefeed);
  const gasBlock = returnAddress(gasfees);
  const permAt = base;
  const feedAt = permAt + permBlock.length;
  const gasAt = feedAt + feedBlock.length;
  if (gasAt > 0xff) throw new Error('registry mock too long for PUSH1 jumps');
  return toHex([...head, ...dispatch(10, permAt), ...dispatch(9, feedAt), ...dispatch(7, gasAt), ...fallthrough, ...permBlock, ...feedBlock, ...gasBlock]);
}

/**
 * Price feed mock: `getLatestPrice()` (0x8e15f473) returns (price, block.timestamp, 0) with
 * six implied decimals, matching the three-word shape measured on 2026-09-12; `decimals()`
 * (0x313ce567) returns 6. Anything else reverts.
 */
export function priceFeedMock(rawPrice = 2431) {
  const selector = [...push([0]), OP.CALLDATALOAD, ...push([0xe0]), OP.SHR];
  const dispatch = (sel, target) => [OP.DUP1, ...push(hexBytes(sel)), OP.EQ, ...push([target]), OP.JUMPI];
  const revert = [...push([0]), ...push([0]), OP.REVERT];
  const priceBytes = [rawPrice >> 8, rawPrice & 0xff];
  const priceBlock = [OP.JUMPDEST, ...push(priceBytes), ...push([0]), OP.MSTORE, OP.TIMESTAMP, ...push([0x20]), OP.MSTORE, ...push([0]), ...push([0x40]), OP.MSTORE, ...push([0x60]), ...push([0]), OP.RETURN];
  const decimalsBlock = [OP.JUMPDEST, ...push([6]), ...push([0]), OP.MSTORE, ...push([0x20]), ...push([0]), OP.RETURN];
  const base = selector.length + 2 * 10 + revert.length;
  const priceAt = base;
  const decimalsAt = priceAt + priceBlock.length;
  return toHex([...selector, ...dispatch('8e15f473', priceAt), ...dispatch('313ce567', decimalsAt), ...revert, ...priceBlock, ...decimalsBlock]);
}
