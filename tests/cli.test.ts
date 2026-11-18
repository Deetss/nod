import { describe, expect, it } from 'vitest';
import { SETTINGS_USAGE, cliArgs, cliCommand, pairText, parseSettingsArgs, settingsText } from '../server/cli';
import { qrText } from '../server/qr-text';

describe('cliCommand', () => {
  it('reads the command from the first argument', () => {
    expect(cliCommand(['nod', 'pair', '--ozone-platform=headless'])).toBe('pair');
    expect(cliCommand(['nod', 'settings', 'orgs', 'a'])).toBe('settings');
    expect(cliCommand(['nod', 'update'])).toBe('update');
    expect(cliCommand(['nod', '--update'])).toBe('update');
    expect(cliCommand(['nod'])).toBeUndefined();
    expect(cliCommand(['nod', '--serve'])).toBeUndefined();
  });

  it('finds the command after switches Chromium moved ahead of it', () => {
    expect(cliCommand(['nod', '--ozone-platform=headless', 'settings', 'orgs', 'a'])).toBe('settings');
    expect(cliCommand(['nod', '--ozone-platform=headless', 'update'])).toBe('update');
    expect(cliArgs(['nod', '--ozone-platform=headless', 'settings', 'orgs', 'a', 'b'])).toEqual(['orgs', 'a', 'b']);
    expect(cliArgs(['nod', 'pair', '--ozone-platform=headless'])).toEqual([]);
  });
});

describe('parseSettingsArgs', () => {
  it('prints with no words', () => {
    expect(parseSettingsArgs(['--ozone-platform=headless'])).toEqual({});
  });
  it('sets and clears orgs', () => {
    expect(parseSettingsArgs(['orgs', 'Acme', 'Octo'])).toEqual({ edit: { orgs: ['Acme', 'Octo'] } });
    expect(parseSettingsArgs(['orgs'])).toEqual({ edit: { orgs: [] } });
  });
  it('turns involved on and off', () => {
    expect(parseSettingsArgs(['involved', 'off'])).toEqual({ edit: { includeInvolved: false } });
    expect(parseSettingsArgs(['involved', 'on', '--ozone-platform=headless'])).toEqual({ edit: { includeInvolved: true } });
  });
  it('rejects anything else with the usage line', () => {
    expect(parseSettingsArgs(['involved', 'maybe'])).toEqual({ error: SETTINGS_USAGE });
    expect(parseSettingsArgs(['bot'])).toEqual({ error: SETTINGS_USAGE });
  });
});

describe('settingsText', () => {
  it('lists orgs and the involved switch', () => {
    expect(settingsText({ orgs: ['Acme', 'Octo'], includeInvolved: true })).toBe('orgs: Acme, Octo\ninvolved: on');
    expect(settingsText({ orgs: [], includeInvolved: false })).toBe('orgs: (none)\ninvolved: off');
  });
});

describe('pairText', () => {
  it('shows the link, a QR code and the minutes left', () => {
    const link = 'https://box.example.ts.net/pair#code=abc';
    const text = pairText({ code: 'abc', link, expiresAt: '2026-01-01T00:10:00Z' }, new Date('2026-01-01T00:00:00Z'));
    expect(text).toContain(link);
    expect(text).toContain('Expires in 10 min.');
    expect(text).toContain('\x1b[30;47m');
  });
});

describe('qrText', () => {
  it('draws two module rows per line with a quiet zone', () => {
    const lines = qrText('https://box.example.ts.net/pair#code=abc').split('\n');
    const first = (lines[0] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    expect(lines.length).toBe(Math.ceil(first.length / 2));
    expect(first).toBe(' '.repeat(first.length));
  });
});