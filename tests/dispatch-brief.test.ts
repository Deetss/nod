import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { briefLine, writeBrief } from '../server/dispatch-brief';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nod-brief-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('briefLine', () => {
  it('keeps the tagged first line and points at the file', () => {
    expect(briefLine('[nod] 2 review findings on a/b#1.\n\n(1) ...', '/s/x.md')).toBe('[nod] 2 review findings on a/b#1. Read the full list in /s/x.md');
  });
  it('tags a first line that has no tag', () => {
    expect(briefLine('Fix these.\nmore', '/s/x.md')).toBe('[nod] Fix these. Read the full list in /s/x.md');
  });
  it('cuts a long first line so the whole line fits 600 characters', () => {
    const line = briefLine(`[nod] ${'w'.repeat(900)}\nmore`, '/s/x.md');
    expect(line).toHaveLength(600);
    expect(line).toMatch(/w\.\.\. Read the full list in \/s\/x\.md$/);
  });
});

describe('writeBrief', () => {
  it('writes the whole prompt with mode 600 and returns the line to send', async () => {
    const text = '[nod] 2 review findings on a/b#1.\n\n(1) major, x.ts:1\nWhole text.\nhttps://example.test/1';
    const line = await writeBrief(text, dir, Date.parse('2026-11-18T12:00:00Z'));
    const [name] = readdirSync(dir);
    expect(name).toMatch(/^2026-11-18-[0-9a-f]{8}\.md$/);
    const file = join(dir, name!);
    expect(readFileSync(file, 'utf8')).toBe(`${text}\n`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(line).toBe(`[nod] 2 review findings on a/b#1. Read the full list in ${file}`);
  });

  it('removes files older than a week', async () => {
    const old = join(dir, 'old.md');
    writeFileSync(old, 'x');
    const now = Date.now();
    const eightDays = (now - 8 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(old, eightDays, eightDays);
    await writeBrief('[nod] a\nb', dir, now);
    expect(readdirSync(dir)).not.toContain('old.md');
    expect(readdirSync(dir)).toHaveLength(1);
  });
});
