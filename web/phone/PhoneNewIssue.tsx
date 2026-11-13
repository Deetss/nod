import { useMemo, useState } from 'react';
import { canCreate, bodyPreview, descriptionDraftKey, hasDraft, type NewIssueForm } from './new-issue';
import { clearDraft } from './PhoneComposer';
import { AssigneesValue, FieldRow, LabelsValue, spokenList } from './PhonePickerParts';
import { useRepoMeta } from './PhoneIssuePicker';
import { PhoneSheet } from './PhoneSheet';
import { useKeyboardInset } from './useKeyboardInset';
import { repoLabel } from '../repo-label';

interface NewIssueProps {
  form: NewIssueForm;
  writesOff: boolean;
  /** The create request is running or the new issue is loading. */
  busy: boolean;
  depth: number;
  covered: boolean;
  onChange: (form: NewIssueForm) => void;
  onPick: (field: 'repository' | 'labels' | 'assignees') => void;
  onDescription: () => void;
  onCreate: () => void;
  onClose: () => void;
}

/** Full sheet form for a new issue. Create sends one request and the host opens the result. */
export function PhoneNewIssue(p: NewIssueProps) {
  const { form } = p;
  const [asking, setAsking] = useState(false);
  const height = useKeyboardInset();
  const meta = useRepoMeta(form.repo);
  const labels = useMemo(
    () => form.labels.map((name) => meta.data?.labels.find((l) => l.name === name) ?? { name, color: 'ededed' }),
    [form.labels, meta.data],
  );
  const can = canCreate(form, p.writesOff);
  // Only the create request is a write; the form stays editable offline.
  const off = p.busy;

  const close = () => {
    if (p.busy) return;
    if (hasDraft(form)) setAsking(true);
    else p.onClose();
  };

  return (
    <PhoneSheet
      title="New issue"
      sub={form.repo}
      depth={p.depth}
      covered={p.covered}
      keyboardHeight={height}
      onClose={close}
      bar={
        <>
          <button
            type="button"
            className={`ph-btn is-primary${can || p.busy ? '' : ' is-off'}${p.busy ? ' is-busy' : ''}`}
            disabled={!can && !p.busy}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={() => {
              if (can && !p.busy) p.onCreate();
            }}
          >
            {p.busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Creating...
              </>
            ) : (
              'Create issue'
            )}
          </button>
          <button type="button" className="ph-btn" disabled={p.busy} onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <FieldRow label="Repository" spoken={form.repo} off={off} note="" onOpen={() => p.onPick('repository')}>
        <span className="ph-field-text">{repoLabel(form.repo)}</span>
      </FieldRow>
      <div className="ph-pad ph-nif">
        <label className="ph-nif-label" htmlFor="ph-nif-title">
          Title
        </label>
        <input
          id="ph-nif-title"
          className="ph-input"
          type="text"
          value={form.title}
          placeholder="Issue title"
          readOnly={off}
          required
          aria-label="Title, required"
          enterKeyHint="next"
          onChange={(e) => p.onChange({ ...form, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              p.onDescription();
            }
          }}
        />
        <span className="ph-nif-label">Description</span>
        <button
          type="button"
          className="ph-nif-body"
          disabled={off}
          aria-label={`Description, ${form.body.trim() ? 'set' : 'empty'}. Edit`}
          onClick={p.onDescription}
        >
          {form.body.trim() ? (
            bodyPreview(form.body)
          ) : (
            <span className="ph-muted">Add a description. Markdown supported.</span>
          )}
        </button>
      </div>
      <FieldRow label="Labels" spoken={spokenList(form.labels)} off={off} note="" onOpen={() => p.onPick('labels')}>
        <LabelsValue labels={labels} />
      </FieldRow>
      <FieldRow label="Assignees" spoken={spokenList(form.assignees)} off={off} note="" onOpen={() => p.onPick('assignees')}>
        <AssigneesValue logins={form.assignees} />
      </FieldRow>
      <span className="sr-only" role="status">
        {p.busy ? `Creating issue in ${repoLabel(form.repo)}` : ''}
      </span>
      {asking ? (
        <div className="ph-scrim is-center" style={{ zIndex: 80 }} onClick={() => setAsking(false)}>
          <div className="ph-confirm" role="alertdialog" aria-label="Discard draft?" onClick={(e) => e.stopPropagation()}>
            <h2>Discard draft?</h2>
            <button
              type="button"
              className="ph-btn is-danger"
              onClick={() => {
                clearDraft(descriptionDraftKey(form.repo));
                p.onClose();
              }}
            >
              Discard
            </button>
            <button type="button" className="ph-btn" onClick={() => setAsking(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </PhoneSheet>
  );
}
