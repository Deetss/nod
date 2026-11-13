import { fixMenuLabel, fixRowsFor } from '../fix-rows';
import type { OrcaChoice } from '../useFixChecks';
import type { ActionItem } from './action-items';
import type { FixMode } from './sheet-stack';

interface PhoneFixInput {
  mode: FixMode;
  orca: OrcaChoice;
  writesOff: boolean;
  busy: boolean;
}

const OFFLINE = 'Offline';

export const phoneFixTitle = (mode: FixMode): string => fixMenuLabel({ mode });

/**
 * The desktop FixMenu rows as action sheet items. A disabled row keeps its sub line as the reason;
 * offline turns every row off, as the desktop does by refusing to open the menu.
 */
export function phoneFixItems({ mode, orca, writesOff, busy }: PhoneFixInput): ActionItem[] {
  const rows = fixRowsFor({ mode, orca, busy, disabled: writesOff ? OFFLINE : undefined });
  return rows.map((r): ActionItem => {
    const off = r.disabled ? r.sub : writesOff ? OFFLINE : undefined;
    return {
      id: r.kind === 'bot' ? 'fix-bot' : 'fix-dispatch',
      label: r.title,
      sub: r.sub,
      ...(off ? { disabled: off, dashed: r.disabled } : r.kind === 'dispatch' ? { confirm: true } : { opens: true }),
    };
  });
}
