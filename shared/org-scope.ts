/**
 * Most orgs one search can name. Searches use GitHub's advanced syntax, which allows five AND/OR
 * operators, and the delta and mention searches share the budget, so one is kept spare.
 */
export const MAX_ORGS = 5;

/** Most orgs that fit next to `involves:@me`, which takes one more OR. */
export const MAX_ORGS_WITH_INVOLVED = MAX_ORGS - 1;

/**
 * The search qualifier for the configured orgs. With none it falls back to everything the
 * viewer is involved in, so a personal setup works without an org. Advanced search reads a
 * space as AND, so orgs are always OR'd. With `includeInvolved` the viewer's own involvement
 * joins the OR, so personal repos show beside the orgs.
 */
export function orgScope(orgs: readonly string[], includeInvolved = false): string {
  if (orgs.length === 0) return 'involves:@me';
  const terms = orgs.map((o) => `org:${o}`);
  if (includeInvolved) terms.push('involves:@me');
  const joined = terms.join(' OR ');
  return terms.length > 1 ? `(${joined})` : joined;
}
