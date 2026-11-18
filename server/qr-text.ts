import { qrModules } from '../shared/qr';

const QUIET = 2;
const ON_WHITE = '\x1b[30;47m';
const RESET = '\x1b[0m';

/** A QR code for a terminal: black on white with a quiet zone, two rows per line, readable on any theme. */
export function qrText(text: string): string {
  const rows = qrModules(text);
  const size = rows.length + QUIET * 2;
  const dark = (r: number, c: number): boolean => rows[r - QUIET]?.[c - QUIET] ?? false;
  const lines: string[] = [];
  for (let r = 0; r < size; r += 2) {
    let line = '';
    for (let c = 0; c < size; c++) {
      const top = dark(r, c);
      const bottom = dark(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(`${ON_WHITE}${line}${RESET}`);
  }
  return lines.join('\n');
}