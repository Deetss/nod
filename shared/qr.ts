/**
 * A small QR code encoder: byte mode, error correction level M, versions 1 to 10
 * (up to 213 bytes). Enough for a pairing link. Follows ISO/IEC 18004.
 */

const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = ECC_PER_BLOCK.length;
const MASKS = 8;

const bit = (n: number, i: number): boolean => ((n >>> i) & 1) !== 0;

function rawModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (v: number): number =>
  Math.floor(rawModules(v) / 8) - (ECC_PER_BLOCK[v - 1] ?? 0) * (BLOCKS[v - 1] ?? 1);

const byteCapacity = (v: number): number => Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);

/** Multiplies in GF(256) with the QR polynomial 0x11D. */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j] ?? 0, root);
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMul(coef, factor);
    });
  }
  return result;
}

function alignPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** Data bits for the text, padded to the version's capacity, then split into blocks with error correction. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capacityBits = dataCodewords(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);

  const numBlocks = BLOCKS[version - 1] ?? 1;
  const eccLen = ECC_PER_BLOCK[version - 1] ?? 0;
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= shortBlocks) out.push(block[i] ?? 0);
    });
  }
  return out;
}

function maskHit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Matrix {
  readonly size: number;
  readonly dark: boolean[][];
  private readonly fixed: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.drawPatterns();
  }

  private setFixed(x: number, y: number, on: boolean): void {
    const row = this.dark[y];
    const lock = this.fixed[y];
    if (!row || !lock) return;
    row[x] = on;
    lock[x] = true;
  }

  private drawPatterns(): void {
    const { size, version } = this;
    for (let i = 0; i < size; i++) {
      this.setFixed(6, i, i % 2 === 0);
      this.setFixed(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) this.setFixed(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
    const pos = alignPositions(version, size);
    const last = pos.length - 1;
    pos.forEach((px, i) => {
      pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) this.setFixed(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    this.drawFormat(0);
    if (version >= 7) this.drawVersion();
  }

  /** Level M is format code 0, so the five data bits are just the mask. */
  drawFormat(mask: number): void {
    const { size } = this;
    let rem = mask;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((mask << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.setFixed(8, i, bit(bits, i));
    this.setFixed(8, 7, bit(bits, 6));
    this.setFixed(8, 8, bit(bits, 7));
    this.setFixed(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFixed(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.setFixed(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.setFixed(8, size - 15 + i, bit(bits, i));
    this.setFixed(8, size - 8, true);
  }

  private drawVersion(): void {
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFixed(a, b, bit(bits, i));
      this.setFixed(b, a, bit(bits, i));
    }
  }

  drawCodewords(data: number[]): void {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (this.fixed[y]?.[x] || i >= data.length * 8) continue;
          const row = this.dark[y];
          if (row) row[x] = bit(data[i >>> 3] ?? 0, 7 - (i & 7));
          i++;
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const row = this.dark[y];
        if (row && !this.fixed[y]?.[x] && maskHit(mask, x, y)) row[x] = !row[x];
      }
    }
  }

  /** Lower is better. The four rules of the spec: runs, 2x2 blocks, finder-like runs, dark balance. */
  penalty(): number {
    const { size, dark } = this;
    const at = (x: number, y: number) => dark[y]?.[x] === true;
    let score = 0;
    const lines = [
      ...dark.map((row) => row.slice()),
      ...Array.from({ length: size }, (_, x) => dark.map((row) => row[x] === true)),
    ];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) {
          run++;
          continue;
        }
        if (run >= 5) score += run - 2;
        run = 1;
      }
      const s = line.map((b) => (b ? '1' : '0')).join('');
      for (const pat of ['00001011101', '10111010000']) {
        for (let from = s.indexOf(pat); from !== -1; from = s.indexOf(pat, from + 1)) score += 40;
      }
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = at(x, y);
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
      }
    }
    const total = size * size;
    const darkCount = dark.reduce((n, row) => n + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
    return score;
  }
}

/** The QR code for `text` as rows of dark modules, without the quiet zone. Throws when it does not fit. */
export function qrModules(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= MAX_VERSION && byteCapacity(version) < bytes.length) version++;
  if (version > MAX_VERSION) throw new Error('Text is too long for the QR encoder');

  const m = new Matrix(version);
  m.drawCodewords(codewords(bytes, version));
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < MASKS; mask++) {
    m.applyMask(mask);
    m.drawFormat(mask);
    const score = m.penalty();
    m.applyMask(mask);
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
  }
  m.applyMask(best);
  m.drawFormat(best);
  return m.dark;
}
