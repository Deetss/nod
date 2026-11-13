import { createElement } from 'react';
import type { IssueAction, RepoMeta } from '../../shared/issue-types';
import { LabelChip } from '../issues/parts';
import type { PickerItem } from '../issues/picker-state';
import { PersonRow } from './PhonePickerParts';

export type IssuePickerField = 'labels' | 'assignees' | 'milestone';
export type PickerField = IssuePickerField | 'repository';

/** GitHub refuses more than this many assignees on one issue. */
export const ASSIGNEE_LIMIT = 10;

export const FIELD_COPY: Record<PickerField, { title: string; filter: string; empty: (repo: string) => string }> = {
  labels: { title: 'Labels', filter: 'Filter labels', empty: (r) => `No labels in ${r}.` },
  assignees: { title: 'Assignees', filter: 'Filter assignees', empty: (r) => `No one can be assigned in ${r}.` },
  milestone: { title: 'Milestone', filter: 'Filter milestones', empty: (r) => `No milestones in ${r}.` },
  repository: { title: 'Repository', filter: 'Filter repositories', empty: () => 'No repositories.' },
};

/** Value of the `No milestone` row. */
export const NO_MILESTONE = '';

/** Rows for a field. The viewer sorts first among assignees, then login order. */
export function pickerItems(field: PickerField, meta: RepoMeta, viewer: string): PickerItem[] {
  if (field === 'labels') {
    return meta.labels.map((l) => ({ value: l.name, text: l.name, node: createElement(LabelChip, { label: l }) }));
  }
  if (field === 'assignees') {
    const users = [...meta.users].sort((a, b) =>
      a.login === viewer ? -1 : b.login === viewer ? 1 : a.login.localeCompare(b.login),
    );
    return users.map((u) => ({
      value: u.login,
      text: u.login,
      node: createElement(PersonRow, { login: u.login, you: u.login === viewer }),
    }));
  }
  return [
    { value: NO_MILESTONE, text: 'No milestone', node: 'No milestone' },
    ...meta.milestones.map((m) => ({ value: m.title, text: m.title, node: m.title })),
  ];
}

/** The one request for a picker's change, or undefined when nothing changed. */
export function pickerAction(
  field: 'labels' | 'assignees' | 'milestone',
  ref: { repo: string; number: number },
  initial: ReadonlySet<string>,
  picked: ReadonlySet<string>,
): IssueAction | undefined {
  if (field === 'milestone') {
    const title = [...picked][0] ?? NO_MILESTONE;
    if (initial.has(title)) return undefined;
    return { type: 'milestone', ...ref, milestone: title === NO_MILESTONE ? null : title };
  }
  const add = [...picked].filter((v) => !initial.has(v));
  const remove = [...initial].filter((v) => !picked.has(v));
  if (add.length === 0 && remove.length === 0) return undefined;
  return { type: field, ...ref, add, remove };
}

/** Toast copy for a finished picker write. */
export function pickerDone(field: 'labels' | 'assignees' | 'milestone', ref: string, picked: ReadonlySet<string>): string {
  if (field === 'labels') return `Labels updated on ${ref}`;
  if (field === 'assignees') return `Assignees updated on ${ref}`;
  const title = [...picked][0];
  return title ? `Milestone set to ${title} on ${ref}` : `Milestone cleared on ${ref}`;
}
