import { isOwnPr, sameLogin } from './pr-actions';
import type { PrSummary, Section, SectionKey } from './types';

const TITLES: Record<SectionKey, string> = {
  needs: 'Needs my review',
  mine: 'Mine',
  org: 'Org open',
  dependabot: 'Dependabot',
};

export const SECTION_ORDER: SectionKey[] = ['needs', 'mine', 'org', 'dependabot'];

export function isDependabot(login: string): boolean {
  return /^(app\/)?dependabot(\[bot\])?$/i.test(login);
}

/** Which sections a PR belongs in. Org open is every non-draft PR not in another section. */
export function sectionsFor(
  pr: PrSummary,
  viewer: string,
  teams: readonly string[] = [],
): SectionKey[] {
  const keys: SectionKey[] = [];
  const asked = pr.requested ?? [];
  const askedOf = (who: string) => asked.some((a) => sameLogin(a, who));
  const unknown = pr.requestsTruncated === true && !isOwnPr(pr.author, viewer);
  if (unknown || askedOf(viewer) || teams.some(askedOf)) keys.push('needs');
  if (isOwnPr(pr.author, viewer)) keys.push('mine');
  if (isDependabot(pr.author)) keys.push('dependabot');
  if (keys.length === 0 && !pr.isDraft) keys.push('org');
  return keys;
}

/** Newest update first. The sort is stable, so equal timestamps keep their order. */
export function deriveSections(
  viewer: string,
  prs: PrSummary[],
  teams: readonly string[] = [],
): Section[] {
  return SECTION_ORDER.map((key) => {
    const members = prs
      .filter((p) => sectionsFor(p, viewer, teams).includes(key))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { key, title: TITLES[key], count: members.length, prs: members };
  });
}
