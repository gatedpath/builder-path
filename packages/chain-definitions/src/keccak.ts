// Keccak-256 as used by Ethereum (Keccak-f[1600], rate 1088, padding byte 0x01).
// Pure TypeScript on BigInt lanes; slow but dependency-free. It only hashes short
// inputs here: function signatures for selectors and addresses for EIP-55 checksums.

const RC: bigint[] = [
  0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n,
];
const ROT: number[][] = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];
const MASK = (1n << 64n) - 1n;
const rot = (x: bigint, n: number): bigint => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);

function permute(s: bigint[]): void {
  for (let r = 0; r < 24; r++) {
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) c[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ rot(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) s[x + y] = s[x + y]! ^ d;
    }
    const b: bigint[] = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rot(s[x + 5 * y]!, ROT[x]![y]!);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] = b[x + 5 * y]! ^ (~b[((x + 1) % 5) + 5 * y]! & MASK & b[((x + 2) % 5) + 5 * y]!);
      }
    }
    s[0] = s[0]! ^ RC[r]!;
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  const state: bigint[] = new Array(25).fill(0n);
  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded[input.length] = padded[input.length]! ^ 0x01;
  padded[padded.length - 1] = padded[padded.length - 1]! ^ 0x80;
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < 17; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[offset + i * 8 + b]!);
      state[i] = state[i]! ^ lane;
    }
    permute(state);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i]!;
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s as `0x${string}`;
}

export function keccak256Hex(input: string | Uint8Array): `0x${string}` {
  return bytesToHex(keccak256(typeof input === 'string' ? new TextEncoder().encode(input) : input));
}

/** First four bytes of keccak256 of a canonical function signature, e.g. `isAllowed(address)`. */
export function functionSelector(signature: string): `0x${string}` {
  return keccak256Hex(signature).slice(0, 10) as `0x${string}`;
}

/** EIP-55 mixed-case checksum of a 20-byte hex address. Throws on malformed input. */
export function checksumAddress(address: string): `0x${string}` {
  const lower = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) throw new Error(`not an address: ${address}`);
  const hash = keccak256Hex(lower.slice(2)).slice(2);
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const ch = lower[i + 2]!;
    out += parseInt(hash[i]!, 16) >= 8 ? ch.toUpperCase() : ch;
  }
  return out as `0x${string}`;
}
