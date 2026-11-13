import { useMemo, useState } from 'react';
import type { Settings } from '../../shared/settings';
import { Btn } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { toForm, toRaw, validateForm } from './form';
import { FieldError, errorId } from './SettingsFields';
import { useSaveSettings } from './useSaveSettings';

/**
 * First run, before `app-settings.json` exists. Continue saves the org (or none) and Skip saves
 * none; either one writes the file, so this does not come back. Esc closes it for this visit only.
 */
export function Welcome({ current, onClose }: { current: Settings; onClose: () => void }) {
  const [org, setOrg] = useState('');
  const { state, save } = useSaveSettings();
  const busy = state.phase === 'saving';
  const done = state.phase === 'done';
  const trap = useFocusTrap(() => {
    if (!busy && !done) onClose();
  });

  const orgs = useMemo(() => (org.trim() === '' ? [] : [org.trim()]), [org]);
  const errors = useMemo(() => validateForm({ ...toForm(current), orgs }), [current, orgs]);
  const orgError = errors['orgs.0'];

  const run = (list: string[]) => void save({ ...current, orgs: list });
  const message = done ? state.message : state.phase === 'error' ? state.message : undefined;

  return (
    <div className="scrim settings-scrim">
      <div ref={trap} className="dialog welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Welcome to Nod</h2>
        <p className="welcome-sub">Pick the GitHub org to watch. Everything else can wait.</p>
        <label className="field-label" htmlFor="welcome-org">
          GitHub org (optional)
        </label>
        <input
          type="text"
          id="welcome-org"
          autoFocus
          value={org}
          placeholder="e.g. acme-web"
          className={orgError ? 'is-invalid' : undefined}
          aria-invalid={orgError ? true : undefined}
          aria-describedby={orgError ? errorId('orgs.0') : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={busy || done}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !orgError && !busy && !done) run(orgs);
          }}
        />
        {orgError ? (
          <FieldError id={errorId('orgs.0')} message={orgError} />
        ) : (
          <p className="settings-help">Leave it empty to watch your own repos. Add orgs later under the gear (,).</p>
        )}
        {message ? (
          <p className={`welcome-note${state.phase === 'error' ? ' is-error' : ''}`} role="status">
            {message}
          </p>
        ) : null}
        <div className="welcome-actions">
          <Btn
            primary
            className={busy ? 'is-busy' : undefined}
            disabled={Boolean(orgError) || done}
            aria-busy={busy || undefined}
            onClick={() => !busy && run(orgs)}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            Continue
          </Btn>
          <Btn disabled={busy || done} onClick={() => run([])}>
            Skip, just my repos
          </Btn>
        </div>
      </div>
    </div>
  );
}
