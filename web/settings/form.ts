import { SettingsSchema, type Settings, type StatusOptionKey } from '../../shared/settings';
import type { SettingsSaveResult } from '../../shared/settings-save';

/** The settings as the dialog edits them: the numeric and list fields are text until Save. */
export interface FormState {
  orgs: string[];
  bot: Settings['bot'];
  projectNumber: string;
  statusField: string;
  options: Record<StatusOptionKey, string>;
  releaseMerge: Settings['releaseMerge'];
  orcaAgents: string;
  pushContact: string;
  androidPackageId: string;
}

/** The first message for each invalid field, keyed by its schema path (`bot.command`, `orgs.0`). */
export type FieldErrors = Record<string, string>;

export type SectionId = 'github' | 'bot' | 'project' | 'release' | 'orca' | 'phone';

export const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'bot', label: 'Bot' },
  { id: 'project', label: 'Project board' },
  { id: 'release', label: 'Release merge' },
  { id: 'orca', label: 'Orca agents' },
  { id: 'phone', label: 'Phone and push' },
];

/** Which section owns each top-level settings key, so an error can point at its section. */
const SECTION_OF_KEY: Record<string, SectionId> = {
  orgs: 'github',
  bot: 'bot',
  project: 'project',
  releaseMerge: 'release',
  orcaAgents: 'orca',
  push: 'phone',
  android: 'phone',
};

export function toForm(s: Settings): FormState {
  return {
    orgs: [...s.orgs],
    bot: { ...s.bot },
    projectNumber: String(s.project.number),
    statusField: s.project.statusField,
    options: { ...s.project.options },
    releaseMerge: { ...s.releaseMerge },
    orcaAgents: s.orcaAgents.join(', '),
    pushContact: s.push.contact,
    androidPackageId: s.android.packageId,
  };
}

/** The settings object the schema validates and the server saves. Blank org rows are dropped. */
export function toRaw(f: FormState): unknown {
  const number = /^\d+$/.test(f.projectNumber.trim()) ? Number(f.projectNumber) : Number.NaN;
  return {
    orgs: f.orgs.map((o) => o.trim()).filter((o) => o !== ''),
    bot: f.bot,
    project: { number, statusField: f.statusField, options: f.options },
    releaseMerge: f.releaseMerge,
    orcaAgents: f.orcaAgents
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a !== ''),
    push: { contact: f.pushContact.trim() },
    android: { packageId: f.androidPackageId.trim() },
  };
}

/** Schema paths a field edits as one value, so `orcaAgents.2` reports on `orcaAgents`. */
function fieldPath(path: readonly PropertyKey[]): string {
  const parts = path.map(String);
  return parts[0] === 'orcaAgents' ? 'orcaAgents' : parts.join('.');
}

/** Every invalid field with its first message. Empty when the form can be saved. */
export function validateForm(f: FormState): FieldErrors {
  const raw = toRaw(f) as { project: { number: number } };
  const result = SettingsSchema.safeParse(raw);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = fieldPath(issue.path);
    if (key in errors) continue;
    errors[key] = key === 'project.number' ? 'Project number must be a whole number above 0' : issue.message;
  }
  return errors;
}

export const errorCount = (errors: FieldErrors): number => Object.keys(errors).length;

/** `Fix 1 field to save`, `Fix 3 fields to save`. */
export function fixText(count: number): string {
  return `Fix ${count} ${count === 1 ? 'field' : 'fields'} to save`;
}

/** Sections that hold at least one invalid field. */
export function sectionsWithErrors(errors: FieldErrors): Set<SectionId> {
  const out = new Set<SectionId>();
  for (const key of Object.keys(errors)) {
    const id = SECTION_OF_KEY[key.split('.')[0] ?? ''];
    if (id) out.add(id);
  }
  return out;
}

/** True when the saved file would differ from what the dialog was opened with. */
export function isDirty(initial: FormState, now: FormState): boolean {
  return JSON.stringify(toRaw(initial)) !== JSON.stringify(toRaw(now));
}

/** What the dialog says after a save, by how the service comes back. */
export function savedMessage(result: SettingsSaveResult): string {
  if (result.mode === 'relaunch') return 'Saved. Nod is restarting and reloads when it is back.';
  if (result.mode === 'exit') return 'Saved. Nod stopped to apply it. Start it again to see the change.';
  return 'Saved. Restart Nod to apply it.';
}
