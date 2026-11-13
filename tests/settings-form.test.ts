import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../shared/settings';
import {
  errorCount,
  fixText,
  isDirty,
  savedMessage,
  sectionsWithErrors,
  toForm,
  toRaw,
  validateForm,
  type FormState,
} from '../web/settings/form';

const base = (): FormState => toForm({ ...DEFAULT_SETTINGS, orgs: ['acme-web'] });
const edit = (patch: Partial<FormState>): FormState => ({ ...base(), ...patch });

describe('settings form', () => {
  it('round-trips the settings it was built from', () => {
    const parsed = parseSettings(toRaw(base()));
    expect(parsed.ok && parsed.settings).toEqual({ ...DEFAULT_SETTINGS, orgs: ['acme-web'] });
  });

  it('has no errors for the defaults', () => {
    expect(validateForm(toForm(DEFAULT_SETTINGS))).toEqual({});
  });

  it('flags a command without a slash on its own field', () => {
    const form = edit({ bot: { ...base().bot, command: 'fixer' } });
    const errors = validateForm(form);
    expect(Object.keys(errors)).toEqual(['bot.command']);
    expect(errors['bot.command']).toMatch(/slash/);
    expect(fixText(errorCount(errors))).toBe('Fix 1 field to save');
  });

  it('counts each invalid field once and pluralises', () => {
    const form = edit({ bot: { ...base().bot, command: 'x', labelColor: 'zzz' } });
    const errors = validateForm(form);
    expect(errorCount(errors)).toBe(2);
    expect(fixText(2)).toBe('Fix 2 fields to save');
  });

  it('keys an invalid org by its row', () => {
    const errors = validateForm(edit({ orgs: ['ok-org', '-bad'] }));
    expect(Object.keys(errors)).toEqual(['orgs.1']);
  });

  it('drops blank org rows instead of flagging them', () => {
    const form = edit({ orgs: ['acme-web', '  ', ''] });
    expect(validateForm(form)).toEqual({});
    expect((toRaw(form) as { orgs: string[] }).orgs).toEqual(['acme-web']);
  });

  it('reports a bad agent list once, on the one field', () => {
    const errors = validateForm(edit({ orcaAgents: 'claude, Bad Id, other Bad' }));
    expect(Object.keys(errors)).toEqual(['orcaAgents']);
    expect(Object.keys(validateForm(edit({ orcaAgents: ' ' })))).toEqual(['orcaAgents']);
  });

  it('flags a project number that is not a whole number', () => {
    for (const text of ['', '1.5', 'x', '-2', '0']) {
      const errors = validateForm(edit({ projectNumber: text }));
      expect(Object.keys(errors)).toEqual(['project.number']);
    }
    expect(validateForm(edit({ projectNumber: ' 12 ' }))).toEqual({});
  });

  it('flags duplicate status names on the options group', () => {
    const form = edit({ options: { ...base().options, done: 'Ready' } });
    expect(Object.keys(validateForm(form))).toEqual(['project.options']);
  });

  it('names the sections that hold errors', () => {
    const errors = validateForm(edit({ orgs: ['-bad'], pushContact: 'nope' }));
    expect([...sectionsWithErrors(errors)].sort()).toEqual(['github', 'phone']);
  });

  it('is dirty only when the saved file would change', () => {
    expect(isDirty(base(), base())).toBe(false);
    expect(isDirty(base(), edit({ orgs: ['acme-web', ''] }))).toBe(false);
    expect(isDirty(base(), edit({ orgs: ['acme-web', 'other'] }))).toBe(true);
    expect(isDirty(base(), edit({ bot: { ...base().bot, name: 'Fixer' } }))).toBe(true);
  });

  it('says which restart happened', () => {
    expect(savedMessage({ ok: true, restarting: true, mode: 'relaunch' })).toMatch(/restarting/);
    expect(savedMessage({ ok: true, restarting: true, mode: 'exit' })).toMatch(/stopped/);
    expect(savedMessage({ ok: true, restarting: false, mode: 'none' })).toMatch(/Restart Nod/);
  });
});
