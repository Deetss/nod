/** Copy and share for an item's GitHub URL. Each resolves to a toast, or nothing when there is none to show. */

export interface LinkResult {
  ok: boolean;
  message: string;
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export async function copyLink(url: string): Promise<LinkResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, message: 'Link copied' };
    }
  } catch {
    // Falls through to the textarea copy.
  }
  return copyWithTextarea(url)
    ? { ok: true, message: 'Link copied' }
    : { ok: false, message: 'Could not copy link' };
}

export async function shareLink(title: string, url: string): Promise<LinkResult | undefined> {
  try {
    await navigator.share({ title, url });
    return undefined;
  } catch (e) {
    if ((e as { name?: unknown } | null)?.name === 'AbortError') return undefined;
    return { ok: false, message: e instanceof Error ? e.message : 'Could not share link' };
  }
}
