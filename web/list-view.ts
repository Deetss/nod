/** Which list the left pane shows. Remembered per browser; `?view=issues` overrides it. */

export type ListView = 'prs' | 'issues' | 'activity';

const KEY = 'nod-view';

export function parseView(v: string | null | undefined): ListView | undefined {
  return v === 'prs' || v === 'issues' || v === 'activity' ? v : undefined;
}

export function savedView(): ListView | undefined {
  try {
    return parseView(window.localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export function saveView(v: ListView): void {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    // storage unavailable; the choice lasts for this session only
  }
}

/** Initial view: `?view=` wins, then the remembered choice, then PRs. */
export function initialView(search: string): ListView {
  const fromUrl = parseView(new URLSearchParams(search).get('view'));
  return fromUrl ?? savedView() ?? 'prs';
}

/** Scrolls a list row into view after the next frame, once the view switch and filter reset have rendered. */
export function scrollRowIntoView(id: string): void {
  requestAnimationFrame(() => {
    document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'nearest' });
  });
}
