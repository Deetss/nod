/**
 * Line 3 of a phone list row drops items in a fixed order when it overflows:
 * the author, then the repo name ellipsizes down to 64px, then the files count
 * (PR) or label chips fold into `+N` one at a time, last label first (issue).
 * CSS cannot drop in that order, so this step toggles classes and re-measures.
 */

export const SQUEEZE_CLASSES = ['is-no-author', 'is-squeezed', 'is-no-files'] as const;

/** The repo name never shrinks under this, or under its own width when shorter. */
export const REPO_MIN = 64;

const overflows = (el: HTMLElement): boolean => el.scrollWidth > el.clientWidth;

/** Label chips and the `+N` variants (`data-k` labels folded) back to the unsqueezed state. */
function resetChips(chips: HTMLElement[], more: HTMLElement[]): void {
  for (const c of chips) c.hidden = false;
  for (const m of more) m.hidden = m.dataset.k !== '0';
}

function showFold(chips: HTMLElement[], more: HTMLElement[], k: number): void {
  chips.forEach((c, i) => {
    c.hidden = i >= chips.length - k;
  });
  for (const m of more) m.hidden = m.dataset.k !== String(k);
}

export function squeezeMeta(el: HTMLElement): void {
  const chips = [...el.querySelectorAll<HTMLElement>('.ph-lrow-chips .label-chip')];
  const more = [...el.querySelectorAll<HTMLElement>('.ph-lrow-chips .chip-more')];
  el.classList.remove(...SQUEEZE_CLASSES);
  el.style.removeProperty('--repo-min');
  resetChips(chips, more);
  if (!overflows(el)) return;

  el.classList.add('is-no-author');
  if (!overflows(el)) return;

  const name = el.querySelector<HTMLElement>('.ph-lrow-repo-name');
  if (name) el.style.setProperty('--repo-min', `${Math.min(REPO_MIN, name.scrollWidth)}px`);
  el.classList.add('is-squeezed');
  if (!overflows(el)) return;

  if (el.querySelector('.ph-lrow-files')) {
    el.classList.add('is-no-files');
    return;
  }
  for (let k = 1; k <= chips.length; k++) {
    showFold(chips, more, k);
    if (!overflows(el)) return;
  }
}

/** Every row's line 3 under `root`, after a width change. */
export function squeezeAll(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('.ph-lrow-meta')) squeezeMeta(el);
}
