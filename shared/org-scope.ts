/**
 * Most orgs that fit next to `involves:@me`. GitHub allows five AND/OR operators in a search,
 * and the delta and mention searches share the budget, so one is kept spare.
 */
export const MAX_ORGS_WITH_INVOLVED = 4;

/**
 * The search qualifier for the configured orgs. With none it falls back to everything the
 * viewer is involved in, so a personal setup works without an org. With `includeInvolved` the
 * orgs and the viewer's own involvement are OR'd, so personal repos show beside the orgs.
 */
export function orgScope(orgs: readonly string[], includeInvolved = false): string {
  if (orgs.length === 0) return 'involves:@me';
  const terms = orgs.map((o) => `org:${o}`);
  if (!includeInvolved) return terms.join(' ');
  return `(${[...terms, 'involves:@me'].join(' OR ')})`;
}
