// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IssueDetail } from '../shared/issue-types';
import { MetadataCards } from '../web/issues/IssueSidebar';
import { assignMe } from '../web/issues/issue-utils';

function detail(assignees: string[]): IssueDetail {
  return {
    summary: {
      id: 'I_1',
      repo: 'acme-api',
      number: 7,
      title: 't',
      author: 'build-bot',
      createdAt: '2026-11-06T10:00:00Z',
      updatedAt: '2026-11-06T10:00:00Z',
      url: 'u',
      state: 'open',
      labels: [],
      assignees,
      commentCount: 0,
      seen: 'seen',
    },
    bodyHtml: '',
    assignees: assignees.map((login) => ({ login })),
    comments: [],
    timeline: [],
    linkedPrs: [],
    participants: [],
    subIssues: [],
    unseenFrom: 0,
  };
}

function render(assignees: string[], viewer: string | undefined): string {
  return renderToStaticMarkup(
    createElement(MetadataCards, {
      detail: detail(assignees),
      disabled: false,
      viewer,
      onUnassign: () => {},
      onLabels: () => {},
      onAssign: () => {},
      onAssignMe: () => {},
      onMilestone: () => {},
      onOpenPr: () => {},
      onOpenGithub: () => {},
    }),
  );
}

describe('assignMe state', () => {
  it('offers Assign me when the viewer is not assigned', () => {
    expect(assignMe([{ login: 'other' }], 'me')).toMatchObject({ label: 'Assign me', assigned: false, enabled: true });
  });

  it('offers Unassign me when the viewer is assigned', () => {
    expect(assignMe([{ login: 'other' }, { login: 'me' }], 'me')).toMatchObject({
      label: 'Unassign me',
      assigned: true,
    });
  });

  it('is disabled until the viewer is known', () => {
    expect(assignMe([], undefined).enabled).toBe(false);
  });
});

describe('Assignees card', () => {
  it('shows "No one assigned" with Assign me and Choose… side by side', () => {
    const html = render([], 'me');
    expect(html).toContain('No one assigned');
    expect(html).toContain('Assign me');
    expect(html).toContain('Choose…');
    expect(html).not.toContain('Unassign me');
  });

  it('shows Unassign me when the viewer is already assigned', () => {
    const html = render(['me'], 'me');
    expect(html).toContain('Unassign me');
    expect(html).not.toContain('No one assigned');
  });

  it('shows Assign me when only someone else is assigned', () => {
    const html = render(['other'], 'me');
    expect(html).toContain('Assign me');
    expect(html).not.toContain('Unassign me');
  });
});
