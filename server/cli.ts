import { updateCheckText, type UpdateCheckResult } from '../shared/app-update';
import type { DeviceRole, PairCode } from '../shared/pairing';
import type { SettingsSaveResult } from '../shared/settings-save';
import { qrText } from './qr-text';
import { requestErrorText, requestUpdate, serviceRequest } from './update-request';

export type CliCommand = 'update' | 'pair' | 'settings';

export const SETTINGS_USAGE = 'Usage: nod settings [orgs <org>... | involved on|off]';

interface ScopeSettings {
  orgs: string[];
  includeInvolved: boolean;
}

type SettingsEdit = { orgs: string[] } | { includeInvolved: boolean };

/** The words in Electron's argv. Chromium moves switches ahead of them, so position 1 may be a switch. */
const words = (argv: readonly string[]): string[] => argv.slice(1).filter((a) => !a.startsWith('-'));

/** The CLI command in Electron's argv, if any. Older wrappers pass `--update`. */
export function cliCommand(argv: readonly string[]): CliCommand | undefined {
  if (argv.includes('--update')) return 'update';
  const [word] = words(argv);
  return word === 'update' || word === 'pair' || word === 'settings' ? word : undefined;
}

/** Everything but the command word, switches included, such as `orgs Acme` or `--admin`. */
export function cliArgs(argv: readonly string[]): string[] {
  const rest = argv.slice(1);
  const at = rest.findIndex((a) => !a.startsWith('-'));
  return at < 0 ? rest : [...rest.slice(0, at), ...rest.slice(at + 1)];
}

/** Parses the words after `nod settings`. No edit means print only. Switches such as Chromium flags are skipped. */
export function parseSettingsArgs(args: readonly string[]): { edit?: SettingsEdit } | { error: string } {
  const [key, ...values] = args.filter((a) => !a.startsWith('--'));
  if (key === undefined) return {};
  if (key === 'orgs') return { edit: { orgs: values } };
  if (key === 'involved' && values.length === 1 && (values[0] === 'on' || values[0] === 'off')) {
    return { edit: { includeInvolved: values[0] === 'on' } };
  }
  return { error: SETTINGS_USAGE };
}

export function settingsText(s: ScopeSettings): string {
  const orgs = s.orgs.length > 0 ? s.orgs.join(', ') : '(none)';
  return `orgs: ${orgs}\ninvolved: ${s.includeInvolved ? 'on' : 'off'}`;
}

/** The role `nod pair` asks for: `--admin`, `--desktop`, or a phone. */
export function pairRole(args: readonly string[]): DeviceRole {
  if (args.includes('--admin')) return 'admin';
  if (args.includes('--desktop')) return 'desktop';
  return 'phone';
}

/** The link, a QR code and the expiry. Never the session token. */
export function pairText(p: PairCode, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.round((Date.parse(p.expiresAt) - now.getTime()) / 60_000));
  return [
    p.role === 'phone'
      ? 'Scan in the Nod app, or open the link in Chrome on the phone:'
      : `Pairs a desktop as ${p.role}. Paste the link in Settings > Hub > Pair this desktop:`,
    p.link,
    '',
    qrText(p.link),
    '',
    `Single use. Expires in ${minutes} min.`,
  ].join('\n');
}

export interface CliResult {
  out: string;
  code: 0 | 1;
}

/** Runs one CLI command against the service on loopback. `args` are the words after the command. */
export async function runCli(command: CliCommand, args: readonly string[], token: string): Promise<CliResult> {
  try {
    if (command === 'update') {
      const result: UpdateCheckResult = await requestUpdate(token);
      return { out: updateCheckText(result), code: result.state === 'failed' ? 1 : 0 };
    }
    if (command === 'pair') {
      const code = await serviceRequest<PairCode>('POST', '/api/pair/code', token, { role: pairRole(args) });

      return { out: pairText(code), code: 0 };
    }
    const parsed = parseSettingsArgs(args);
    if ('error' in parsed) return { out: parsed.error, code: 1 };
    const current = await serviceRequest<ScopeSettings & Record<string, unknown>>('GET', '/api/settings', token);
    if (!parsed.edit) return { out: settingsText(current), code: 0 };
    const next = { ...current, ...parsed.edit };
    const saved = await serviceRequest<SettingsSaveResult>('PUT', '/api/settings', token, next);
    const note = saved.restarting ? 'Saved. Nod restarts to apply it.' : 'Saved.';
    return { out: `${settingsText(next)}\n${note}`, code: 0 };
  } catch (e) {
    return { out: requestErrorText(e), code: 1 };
  }
}
