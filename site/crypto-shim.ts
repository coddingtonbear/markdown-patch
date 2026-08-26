/**
 * A browser stand-in for the sliver of Node's `crypto` the engine actually
 * uses: `createHash("sha256").update(text, "utf8").digest("hex")`, called once
 * by `versionOf` in `src/model.ts` to derive a document's `version` token.
 *
 * The library is deliberately left alone — `esbuild --alias:crypto=` points at
 * this file when bundling for the browser, so a document's version token is
 * byte-identical whether it was computed by Node or by the playground. That
 * matters: the token the playground shows is exactly the one `mdpatch
 * print-map` would print for the same document, so an `ifMatch` demonstrated
 * here is a real one.
 *
 * This is a real SHA-256, not a stand-in hash, for the same reason.
 */

/** SHA-256 round constants: the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The square roots of the first 8 primes: SHA-256's initial state. */
const INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
] as const;

const rotr = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const sha256 = (bytes: Uint8Array): Uint8Array => {
  // Pad to a multiple of 64 bytes: a 0x80 terminator, zeroes, then the message
  // length in bits as a big-endian 64-bit integer.
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  // A JS number holds the low 53 bits exactly, which is far more message than
  // any document here; the high word is written from the float remainder.
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state = Int32Array.from(INITIAL_STATE);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      schedule[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const previous = schedule[i - 15]!;
      const recent = schedule[i - 2]!;
      const s0 = rotr(previous, 7) ^ rotr(previous, 18) ^ (previous >>> 3);
      const s1 = rotr(recent, 17) ^ rotr(recent, 19) ^ (recent >>> 10);
      schedule[i] = (schedule[i - 16]! + s0 + schedule[i - 7]! + s1) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e >>> 0, 6) ^ rotr(e >>> 0, 11) ^ rotr(e >>> 0, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + schedule[i]!) | 0;
      const S0 = rotr(a >>> 0, 2) ^ rotr(a >>> 0, 13) ^ rotr(a >>> 0, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    state[0] = (state[0]! + a) | 0;
    state[1] = (state[1]! + b) | 0;
    state[2] = (state[2]! + c) | 0;
    state[3] = (state[3]! + d) | 0;
    state[4] = (state[4]! + e) | 0;
    state[5] = (state[5]! + f) | 0;
    state[6] = (state[6]! + g) | 0;
    state[7] = (state[7]! + h) | 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, state[i]! >>> 0);
  }
  return digest;
};

const toHex = (bytes: Uint8Array): string => {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
};

/** The only encodings this shim is asked for; anything else is a caller bug. */
export type ShimEncoding = "utf8";

/**
 * The subset of Node's `Hash` the engine uses. `update` accumulates and
 * `digest` finalizes, so multi-chunk callers behave the same as Node's.
 */
export interface Hash {
  update(data: string, encoding?: ShimEncoding): Hash;
  digest(encoding: "hex"): string;
}

const encoder = new TextEncoder();

/**
 * Node's `crypto.createHash`, narrowed to `"sha256"`. Any other algorithm
 * throws rather than silently hashing with the wrong one — if the library ever
 * reaches for a second algorithm, the browser bundle should fail loudly here
 * instead of producing tokens that disagree with Node's.
 */
export const createHash = (algorithm: string): Hash => {
  if (algorithm !== "sha256") {
    throw new Error(
      `crypto shim supports only "sha256"; got ${JSON.stringify(algorithm)}`
    );
  }
  const chunks: Uint8Array[] = [];
  const hash: Hash = {
    update(data: string, encoding: ShimEncoding = "utf8"): Hash {
      if (encoding !== "utf8") {
        throw new Error(
          `crypto shim supports only "utf8" input; got ${JSON.stringify(encoding)}`
        );
      }
      chunks.push(encoder.encode(data));
      return hash;
    },
    digest(encoding: "hex"): string {
      if (encoding !== "hex") {
        throw new Error(
          `crypto shim supports only "hex" output; got ${JSON.stringify(encoding)}`
        );
      }
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const message = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        message.set(chunk, at);
        at += chunk.length;
      }
      return toHex(sha256(message));
    },
  };
  return hash;
};

export default { createHash };
