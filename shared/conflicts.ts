/** Mergeability fields GitHub returns on a pull request. Both are absent on older cached rows. */
export interface MergeabilityFields {
  mergeable?: string;
  mergeStateStatus?: string;
}

/**
 * True when GitHub says the PR conflicts with its base. `UNKNOWN` (still computing) and missing
 * fields are not conflicts, so nothing is drawn until GitHub settles.
 */
export function isConflicting(pr: MergeabilityFields): boolean {
  return pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY';
}
