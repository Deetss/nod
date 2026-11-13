import type { IssueAction } from '../../shared/issue-types';

/** Values of the New issue form. Labels and assignees belong to the repo. */
export interface NewIssueForm {
  repo: string;
  title: string;
  body: string;
  labels: readonly string[];
  assignees: readonly string[];
}

export const emptyForm = (repo: string): NewIssueForm => ({ repo, title: '', body: '', labels: [], assignees: [] });

/** Draft key for the description composer, per repo. */
export const descriptionDraftKey = (repo: string): string => `new-issue:${repo}`;

/** Create is allowed with a non empty title and a connection. */
export const canCreate = (form: NewIssueForm, writesOff: boolean): boolean => !writesOff && form.title.trim() !== '';

/** True when leaving the form would lose something the user typed. */
export const hasDraft = (form: NewIssueForm): boolean => form.title.trim() !== '' || form.body.trim() !== '';

/** Switching repo drops the labels and assignees, which belong to the old repo. */
export const withRepo = (form: NewIssueForm, repo: string): NewIssueForm =>
  repo === form.repo ? form : { ...form, repo, labels: [], assignees: [] };

export function createAction(form: NewIssueForm): Extract<IssueAction, { type: 'create' }> {
  return {
    type: 'create',
    repo: form.repo,
    title: form.title.trim(),
    body: form.body.trim(),
    labels: [...form.labels],
    assignees: [...form.assignees],
  };
}

/** The first lines of the description for the form box. */
export const bodyPreview = (body: string, lines = 4): string => body.split('\n').slice(0, lines).join('\n');
