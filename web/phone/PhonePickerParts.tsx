import type { ReactNode } from 'react';
import type { IssueSummary } from '../../shared/issue-types';
import { LabelChip } from '../issues/parts';

/** Round initial for a login, `ph-av` sized 28. */
export function Avatar({ login }: { login: string }) {
  return (
    <span className="ph-av" aria-hidden="true">
      {login.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PersonRow({ login, you }: { login: string; you: boolean }) {
  return (
    <span className="ph-person">
      <Avatar login={login} />
      <span className="ph-person-name">{login}</span>
      {you ? <span className="ph-person-you">(you)</span> : null}
    </span>
  );
}

interface FieldRowProps {
  label: string;
  /** Spoken value, such as `acme-dev and build-bot` or `none`. */
  spoken: string;
  /** The row shows its value and cannot be tapped. */
  off: boolean;
  /** Right hand note while off. Defaults to `Offline`; an empty string shows none. */
  note?: string;
  onOpen: () => void;
  children: ReactNode;
}

/** One 56 high Details row that opens a picker. */
export function FieldRow(p: FieldRowProps) {
  const body = (
    <>
      <span className="ph-kv-key">{p.label}</span>
      <span className="ph-field-val">{p.children}</span>
    </>
  );
  if (p.off) {
    return (
      <div className="ph-kv ph-field">
        {body}
        {(p.note ?? 'Offline') ? <span className="ph-field-note">{p.note ?? 'Offline'}</span> : null}
      </div>
    );
  }
  return (
    <button type="button" className="ph-kv ph-field" aria-label={`${p.label}, ${p.spoken}. Edit`} onClick={p.onOpen}>
      {body}
      <span className="ph-field-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export const spokenList = (names: readonly string[]): string => {
  if (names.length === 0) return 'none';
  if (names.length === 1) return names[0] ?? 'none';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export function AssigneesValue({ logins }: { logins: readonly string[] }) {
  if (logins.length === 0) return <span className="ph-muted">None</span>;
  const extra = logins.length - 2;
  return (
    <>
      {logins.slice(0, 2).map((l) => (
        <Avatar key={l} login={l} />
      ))}
      <span className="ph-field-text">{logins.join(', ')}</span>
      {extra > 0 ? <span className="ph-muted">+{extra}</span> : null}
    </>
  );
}

export function LabelsValue({ labels }: { labels: IssueSummary['labels'] }) {
  if (labels.length === 0) return <span className="ph-muted">None</span>;
  return (
    <span className="ph-field-chips">
      {labels.map((l) => (
        <LabelChip key={l.name} label={l} />
      ))}
    </span>
  );
}
