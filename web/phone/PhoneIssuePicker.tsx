import { useCallback, useMemo } from 'react';
import type { IssueDetail, IssueSummary, RepoMeta } from '../../shared/issue-types';
import type { PickerItem } from '../issues/picker-state';
import { api } from '../api';
import { useRemote, type Remote } from '../useRemote';
import { withRepo, type NewIssueForm } from './new-issue';
import {
  ASSIGNEE_LIMIT,
  FIELD_COPY,
  NO_MILESTONE,
  pickerAction,
  pickerDone,
  pickerItems,
  type PickerField,
} from './picker-items';
import { PhonePicker } from './PhonePicker';
import { LabelChip } from '../issues/parts';
import type { PhoneWrites } from './usePhoneWrites';
import { repoLabel } from '../repo-label';

interface IssuePickerProps {
  field: 'labels' | 'assignees' | 'milestone';
  issue: IssueSummary;
  detail: Remote<IssueDetail>;
  viewer: string;
  writes: PhoneWrites;
  depth: number;
  covered: boolean;
  onClose: () => void;
}

/** Repo options for the pickers, cached per repo so a second open is instant. */
export function useRepoMeta(repo: string | null): Remote<RepoMeta> {
  return useRemote(repo ? `meta:${repo}` : null, () => api.repoMeta(repo ?? ''));
}

/** Creates a label and hands the picker its row. Rejects with the server message. */
export async function createLabelItem(repo: string, name: string): Promise<PickerItem> {
  const res = await api.issueAction({ type: 'create-label', repo, name });
  if (!res.ok) throw new Error(res.message);
  const label = res.label ?? { name, color: 'ededed' };
  return { value: label.name, text: label.name, node: <LabelChip label={label} /> };
}

interface FormPickerProps {
  field: PickerField;
  form: NewIssueForm;
  repos: readonly string[];
  viewer: string;
  depth: number;
  covered: boolean;
  /** Stores the picked values in the form. No request goes out. */
  onApply: (form: NewIssueForm) => void;
  onNotify: (message: string) => void;
  onClose: () => void;
}

/** Picker opened from the New issue form. Apply only fills the form. */
export function PhoneFormPicker(p: FormPickerProps) {
  const { field, form } = p;
  const meta = useRepoMeta(field === 'repository' ? null : form.repo);
  const copy = FIELD_COPY[field];
  const items = useMemo((): PickerItem[] => {
    if (field === 'repository') return p.repos.map((r) => ({ value: r, text: r, node: r }));
    return meta.data ? pickerItems(field, meta.data, p.viewer) : [];
  }, [field, p.repos, meta.data, p.viewer]);
  const initial = useMemo(
    (): ReadonlySet<string> =>
      new Set(field === 'repository' ? [form.repo] : field === 'labels' ? form.labels : form.assignees),
    [field, form.repo, form.labels, form.assignees],
  );

  const { onNotify } = p;
  const create = useCallback(
    async (name: string) => {
      const item = await createLabelItem(form.repo, name);
      onNotify(`Label ${item.text} created`);
      return item;
    },
    [form.repo, onNotify],
  );

  const apply = (picked: ReadonlySet<string>) => {
    const values = [...picked];
    if (field === 'repository') p.onApply(withRepo(form, values[0] ?? form.repo));
    else p.onApply({ ...form, [field]: values });
    p.onClose();
  };

  return (
    <PhonePicker
      title={copy.title}
      sub={form.repo}
      filterPlaceholder={copy.filter}
      items={items}
      initial={initial}
      single={field === 'repository'}
      loading={field !== 'repository' && meta.loading && !meta.data}
      error={field === 'repository' ? undefined : meta.error}
      onRetry={meta.reload}
      emptyText={copy.empty(form.repo)}
      limit={field === 'assignees' ? ASSIGNEE_LIMIT : undefined}
      note={field === 'assignees' && items.length ? `${items.length} people can be assigned. GitHub allows up to ${ASSIGNEE_LIMIT}.` : undefined}
      autoFocus={field === 'labels'}
      create={field === 'labels' ? create : undefined}
      onApply={apply}
      onClose={p.onClose}
      depth={p.depth}
      covered={p.covered}
    />
  );
}

/** Picker for one field of an existing issue. Apply sends the changed values and closes on success. */
export function PhoneIssuePicker(p: IssuePickerProps) {
  const { issue, field } = p;
  const meta = useRepoMeta(issue.repo);
  const ref = `${repoLabel(issue.repo)} #${issue.number}`;
  const copy = FIELD_COPY[field];

  const items = useMemo(() => (meta.data ? pickerItems(field, meta.data, p.viewer) : []), [meta.data, field, p.viewer]);
  const initial = useMemo((): ReadonlySet<string> => {
    if (field === 'labels') return new Set(issue.labels.map((l) => l.name));
    if (field === 'assignees') return new Set(issue.assignees);
    return new Set([p.detail.data?.milestone ?? NO_MILESTONE]);
  }, [field, issue.labels, issue.assignees, p.detail.data?.milestone]);

  const { notify } = p.writes;
  const create = useCallback(
    async (name: string) => {
      const item = await createLabelItem(issue.repo, name);
      notify(`Label ${item.text} created`);
      return item;
    },
    [issue.repo, notify],
  );

  const apply = async (picked: ReadonlySet<string>) => {
    const action = pickerAction(field, { repo: issue.repo, number: issue.number }, initial, picked);
    if (!action) return p.onClose();
    if (await p.writes.issue(action, pickerDone(field, ref, picked))) p.onClose();
  };

  return (
    <PhonePicker
      title={copy.title}
      sub={ref}
      filterPlaceholder={copy.filter}
      items={items}
      initial={initial}
      single={field === 'milestone'}
      loading={meta.loading && !meta.data}
      error={meta.error}
      onRetry={meta.reload}
      emptyText={copy.empty(issue.repo)}
      limit={field === 'assignees' ? ASSIGNEE_LIMIT : undefined}
      note={field === 'assignees' && items.length ? `${items.length} people can be assigned. GitHub allows up to ${ASSIGNEE_LIMIT}.` : undefined}
      autoFocus={field === 'labels'}
      create={field === 'labels' ? create : undefined}
      busy={p.writes.busy}
      onApply={(picked) => void apply(picked)}
      onClose={p.onClose}
      depth={p.depth}
      covered={p.covered}
    />
  );
}
