import type { IssueSection, IssueSectionKey, IssueSummary } from './issue-types';
import { hasBotLabel } from './bot';
import { DEFAULT_SETTINGS, type BotSettings } from './settings';

const TITLES: Record<IssueSectionKey, string> = {
  progress: 'In progress',
  bot: 'With bot',
  assigned: 'Assigned to me',
  created: 'Created by me',
  mentioned: 'Mentioned',
  untriaged: 'Untriaged',
  all: 'All open',
};

export const ISSUE_SECTION_ORDER: IssueSectionKey[] = [
  'progress',
  'bot',
  'assigned',
  'created',
  'mentioned',
  'untriaged',
  'all',
];

export const DEFAULT_ISSUE_COLLAPSED: IssueSectionKey[] = ['all'];

/** The With bot section shows only when a bot is configured with a label. */
export const botSectionShown = (bot: BotSettings): boolean => bot.enabled && bot.label.trim() !== '';

/** Whether an issue belongs in a section. An issue can sit in several. */
export function inIssueSection(
  issue: IssueSummary,
  key: IssueSectionKey,
  viewer: string,
  mentioned: ReadonlySet<string>,
  inProgress: string = DEFAULT_SETTINGS.project.options.inProgress,
  bot: BotSettings = DEFAULT_SETTINGS.bot,
): boolean {
  switch (key) {
    case 'progress':
      return issue.status === inProgress && issue.assignees.includes(viewer);
    case 'bot':
      return botSectionShown(bot) && issue.state === 'open' && hasBotLabel(issue.labels, bot);
    case 'assigned':
      return issue.assignees.includes(viewer);
    case 'created':
      return issue.author === viewer;
    case 'mentioned':
      return mentioned.has(issue.id);
    case 'untriaged':
      return issue.labels.length === 0 && issue.assignees.length === 0;
    case 'all':
      return true;
  }
}

/**
 * Newest update first. The sort is stable, so equal timestamps keep their order.
 * An issue sits in the first of In progress, With bot, Assigned, Created, Mentioned and Untriaged
 * that fits it, so those counts add up. All open lists every issue. With bot appears only
 * when the bot is enabled and labelled; its title takes the bot's name.
 */
export function deriveIssueSections(
  viewer: string,
  issues: readonly IssueSummary[],
  mentionedIds: readonly string[] = [],
  inProgress: string = DEFAULT_SETTINGS.project.options.inProgress,
  bot: BotSettings = DEFAULT_SETTINGS.bot,
): IssueSection[] {
  const mentioned = new Set(mentionedIds);
  const byNewest = [...issues].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const claimed = new Set<string>();
  const keys = ISSUE_SECTION_ORDER.filter((key) => key !== 'bot' || botSectionShown(bot));
  return keys.map((key) => {
    const members = byNewest.filter(
      (i) =>
        inIssueSection(i, key, viewer, mentioned, inProgress, bot) && (key === 'all' || !claimed.has(i.id)),
    );
    if (key !== 'all') for (const i of members) claimed.add(i.id);
    const title = key === 'bot' ? `With ${bot.name}` : TITLES[key];
    return { key, title, count: members.length, issues: members };
  });
}
