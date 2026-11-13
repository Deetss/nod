import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Settings } from '../../shared/settings';
import { Btn, CheckIcon } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import {
  errorCount,
  fixText,
  isDirty,
  SECTIONS,
  sectionsWithErrors,
  toForm,
  toRaw,
  validateForm,
  type FormState,
  type SectionId,
} from './form';
import { ErrorIcon } from './SettingsFields';
import { SettingsPane } from './SettingsPanes';
import { useSaveSettings } from './useSaveSettings';

const DEFAULT_STATUS = 'Saved to app-settings.json. The service restarts to apply.';

interface StatusProps {
  tone: 'muted' | 'danger' | 'attention' | 'ok';
  children: string;
}

/** The footer's left text. Each tone also has its own icon, so colour never carries it alone. */
function Status({ tone, children }: StatusProps) {
  const icon =
    tone === 'danger' ? <ErrorIcon size={16} /> : tone === 'attention' ? <span className="settings-dot" aria-hidden="true" /> : tone === 'ok' ? <CheckIcon size={12} /> : null;
  return (
    <p className={`settings-status is-${tone}`} role={tone === 'muted' ? undefined : 'status'}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** The Settings dialog: a section list, the open section's fields, and Cancel / Save. Opened by `,`. */
export function SettingsDialog({ initial, onClose }: { initial: Settings; onClose: () => void }) {
  const baseline = useMemo(() => toForm(initial), [initial]);
  const [form, setForm] = useState<FormState>(baseline);
  const [section, setSection] = useState<SectionId>('github');
  const { state, save, reset } = useSaveSettings();
  const busy = state.phase === 'saving';
  const done = state.phase === 'done';

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const trap = useFocusTrap(close);

  const errors = useMemo(() => validateForm(form), [form]);
  const invalid = errorCount(errors);
  const failing = useMemo(() => sectionsWithErrors(errors), [errors]);
  const dirty = isDirty(baseline, form);
  const canSave = invalid === 0 && !busy && !done;

  useEffect(() => {
    document.getElementById(`settings-nav-${section}`)?.focus();
    // Focus the list once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback(
    (change: Partial<FormState>) => {
      setForm((f) => ({ ...f, ...change }));
      reset();
    },
    [reset],
  );
  const submit = useCallback(() => {
    if (canSave) void save(toRaw(form));
  }, [canSave, form, save]);

  const moveSection = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(at + (e.key === 'ArrowDown' ? 1 : -1) + SECTIONS.length) % SECTIONS.length];
    if (!next) return;
    setSection(next.id);
    document.getElementById(`settings-nav-${next.id}`)?.focus();
  };

  const status =
    state.phase === 'done' ? (
      <Status tone="ok">{state.message}</Status>
    ) : state.phase === 'saving' ? (
      <Status tone="muted">Saving...</Status>
    ) : invalid > 0 ? (
      <Status tone="danger">{fixText(invalid)}</Status>
    ) : state.phase === 'error' ? (
      <Status tone="danger">{state.message}</Status>
    ) : dirty ? (
      <Status tone="attention">Unsaved changes</Status>
    ) : (
      <Status tone="muted">{DEFAULT_STATUS}</Status>
    );

  return (
    <div className="scrim settings-scrim">
      <div ref={trap} className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-head">
          <h2>Settings</h2>
          <button type="button" className="btn settings-close" aria-label="Close settings" title="Close (Esc)" disabled={busy} onClick={close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections" onKeyDown={moveSection}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                id={`settings-nav-${s.id}`}
                type="button"
                className={`settings-nav-item${s.id === section ? ' is-active' : ''}`}
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => setSection(s.id)}
              >
                {s.label}
                {failing.has(s.id) && s.id !== section ? (
                  <span className="settings-nav-alert">
                    <ErrorIcon size={12} />
                    <span className="sr-only">has an invalid field</span>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="settings-pane">
            <SettingsPane section={section} form={form} errors={errors} patch={patch} onEnter={submit} />
          </div>
        </div>
        <div className="settings-foot">
          {status}
          <div className="settings-foot-actions">
            {done ? (
              <Btn onClick={onClose}>Close</Btn>
            ) : (
              <>
                <Btn disabled={busy} onClick={close}>
                  Cancel
                </Btn>
                <Btn
                  primary
                  className={busy ? 'is-busy' : undefined}
                  disabled={invalid > 0}
                  aria-disabled={busy || undefined}
                  aria-busy={busy || undefined}
                  onClick={submit}
                >
                  {busy ? <span className="spinner" aria-hidden="true" /> : null}
                  Save
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
