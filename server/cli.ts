import { updateCheckText, type UpdateCheckResult } from '../shared/app-update';
import type { PairCode } from '../shared/pairing';
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

/** The CLI command in Electron's argv, if any. Older wrappers pass `--update`. */
export function cliCommand(argv: readonly string[]): CliCommand | undefined {
  if (argv.includes('--update') || argv[1] === 'update') return 'update';
  if (argv[1] === 'pair' || argv[1] === 'settings') return argv[1];
  return undefined;
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

export function pairText(p: PairCode, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.round((Date.parse(p.expiresAt) - now.getTime()) / 60_000));
  return [
    'Scan in the Nod app, or open the link in Chrome on the phone:',
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
      const code = await serviceRequest<PairCode>('POST', '/api/pair/code', token, {});
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
