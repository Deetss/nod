// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { copyLink, shareLink } from '../web/phone/link-actions';

const base: ActionContext = {
  target: 'pr',
  ownPr: false,
  isAdmin: false,
  adminReady: false,
  orcaAvailable: false,
  issueOpen: true,
  assignedToViewer: true,
  writesOff: false,
  canShare: true,
};

const ids = (ctx: ActionContext) => actionItems(ctx).map((i) => i.id);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('link rows', () => {
  it('follow Open on GitHub for a PR', () => {
    const list = ids(base);
    const at = list.indexOf('open-github');
    expect(list.slice(at)).toEqual(['open-github', 'copy-link', 'share-link']);
  });

  it('close out an issue sheet, which has no Open on GitHub row', () => {
    expect(ids({ ...base, target: 'issue' }).slice(-2)).toEqual(['copy-link', 'share-link']);
  });

  it('hide Share when the browser cannot share', () => {
    for (const target of ['pr', 'issue'] as const) {
      const list = ids({ ...base, target, canShare: false });
      expect(list).toContain('copy-link');
      expect(list).not.toContain('share-link');
    }
  });

  it('stay enabled with writes off', () => {
    for (const target of ['pr', 'issue'] as const) {
      const rows = actionItems({ ...base, target, writesOff: true });
      for (const id of ['copy-link', 'share-link']) {
        expect(rows.find((r) => r.id === id)?.disabled).toBeUndefined();
      }
    }
  });
});

describe('copyLink', () => {
  it('uses the clipboard API when present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyLink('https://example.test/pr/1')).toEqual({ ok: true, message: 'Link copied' });
    expect(writeText).toHaveBeenCalledWith('https://example.test/pr/1');
  });

  it('falls back to a textarea when navigator.clipboard is missing', async () => {
    vi.stubGlobal('navigator', {});
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    expect(await copyLink('u')).toEqual({ ok: true, message: 'Link copied' });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the clipboard rejects', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect((await copyLink('u')).ok).toBe(true);
  });

  it('reports failure when the fallback also fails', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyLink('u')).toEqual({ ok: false, message: 'Could not copy link' });
  });
});

describe('shareLink', () => {
  it('ignores AbortError', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    expect(await shareLink('t', 'u')).toBeUndefined();
    expect(share).toHaveBeenCalledWith({ title: 't', url: 'u' });
  });

  it('reports other errors', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('no way')) });
    expect(await shareLink('t', 'u')).toEqual({ ok: false, message: 'no way' });
  });
});
