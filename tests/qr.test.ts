import { describe, expect, it } from 'vitest';
import { qrModules } from '../web/qr';

const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];

function block(rows: boolean[][], x: number, y: number): string[] {
  return FINDER.map((_, dy) => (rows[y + dy] ?? []).slice(x, x + 7).map((b) => (b ? '1' : '0')).join(''));
}

describe('qrModules', () => {
  it('picks the smallest version that fits', () => {
    expect(qrModules('a'.repeat(14))).toHaveLength(21);
    expect(qrModules('a'.repeat(15))).toHaveLength(25);
    expect(qrModules('a'.repeat(213))).toHaveLength(57);
  });

  it('draws the three finder patterns', () => {
    const rows = qrModules('https://host.example:8443/pair#code=abc');
    const n = rows.length;
    expect(block(rows, 0, 0)).toEqual(FINDER);
    expect(block(rows, n - 7, 0)).toEqual(FINDER);
    expect(block(rows, 0, n - 7)).toEqual(FINDER);
  });

  it('draws the timing pattern and the fixed dark module', () => {
    const rows = qrModules('hello');
    const n = rows.length;
    for (let i = 8; i < n - 8; i++) {
      expect(rows[6]?.[i]).toBe(i % 2 === 0);
      expect(rows[i]?.[6]).toBe(i % 2 === 0);
    }
    expect(rows[n - 8]?.[8]).toBe(true);
  });

  it('is deterministic', () => {
    expect(qrModules('same')).toEqual(qrModules('same'));
    expect(qrModules('same')).not.toEqual(qrModules('else'));
  });

  it('throws when the text does not fit', () => {
    expect(() => qrModules('a'.repeat(214))).toThrow();
  });
});
