import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { attentionTone, projectOff } from '../../shared/connection';
import type { Settings } from '../../shared/settings';
import { AppDialog } from '../AppDialog';
import { Btn, CheckIcon } from '../ui';
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
import type { ConnectionView } from './useConnection';

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
interface SettingsDialogProps {
  initial: Settings;
  onClose: () => void;
  initialSection?: SectionId;
  /** The GitHub token's state, shown on the GitHub pane and marked in the section list. */
  connection?: ConnectionView;
  /** Opened from a token banner: focus lands on Check again. */
  focusCheck?: boolean;
  /** Repos seen in the inbox, for Settings > Hub. */
  repos?: readonly string[];
}

/** The `!` on a section, for the token. Shown on the active section too. */
function NavMark({ tone }: { tone: 'danger' | 'attention' }) {
  return (
    <span className={`settings-nav-alert nav-mark is-${tone}`}>
      <span aria-hidden="true">!</span>
      <span className="sr-only">needs attention</span>
    </span>
  );
}

export function SettingsDialog({ initial, onClose, initialSection, connection, focusCheck, repos }: SettingsDialogProps) {
  const [paneNote, setPaneNote] = useState<string | undefined>();
  const baseline = useMemo(() => toForm(initial), [initial]);
  const [form, setForm] = useState<FormState>(baseline);
  const [section, setSection] = useState<SectionId>(initialSection ?? 'github');
  const { state, save, reset } = useSaveSettings();
  const busy = state.phase === 'saving';
  const done = state.phase === 'done';

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const errors = useMemo(() => validateForm(form), [form]);
  const invalid = errorCount(errors);
  const failing = useMemo(() => sectionsWithErrors(errors), [errors]);
  const dirty = isDirty(baseline, form);
  const canSave = invalid === 0 && !busy && !done;

  const tone = attentionTone(connection?.connection);
  const statusOff = projectOff(connection?.connection);

  useEffect(() => {
    // Opened from a token banner: the Connection card focuses Check again itself.
    if (focusCheck) return;
    // Opened to a section: land on its first control. Otherwise focus the list.
    const first = initialSection
      ? document.querySelector<HTMLElement>('.settings-pane-body [role="switch"], .settings-pane-body input')
      : null;
    (first ?? document.getElementById(`settings-nav-${section}`))?.focus();
    // Focus once, on open.
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
      <Status tone="muted">{paneNote ?? DEFAULT_STATUS}</Status>
    );

  return (
    <AppDialog
      title="Settings"
      width={880}
      className="settings-dialog"
      busy={busy}
      onClose={close}
      footerNote={status}
      footer={
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
      }
    >
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
              {s.id === 'github' && tone ? (
                <NavMark tone={tone} />
              ) : s.id === 'project' && statusOff ? (
                <span className="settings-nav-note">Status off</span>
              ) : failing.has(s.id) && s.id !== section ? (
                <span className="settings-nav-alert">
                  <ErrorIcon size={12} />
                  <span className="sr-only">has an invalid field</span>
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          <SettingsPane
            section={section}
            form={form}
            errors={errors}
            patch={patch}
            onEnter={submit}
            connection={connection}
            focusCheck={focusCheck}
            repos={repos}
            onFooterNote={setPaneNote}

          />
        </div>
      </div>
    </AppDialog>
  );
}
