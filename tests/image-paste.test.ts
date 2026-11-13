// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD_MAX_BYTES, type UploadResult } from '../shared/image-upload';
import { ActionDialog } from '../web/Dialogs';
import { PhoneComposer } from '../web/phone/PhoneComposer';
import type { PrSummary } from '../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSET = 'https://github.com/user-attachments/assets/1a2b3c';

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.localStorage.clear();
});

/** An upload the test settles by hand. */
function deferredUpload() {
  let settle: { resolve: (r: UploadResult) => void; reject: (e: Error) => void } | undefined;
  const upload = vi.fn(
    (_repo: string, _file: File) =>
      new Promise<UploadResult>((resolve, reject) => {
        settle = { resolve, reject };
      }),
  );
  return { upload, settle: () => settle! };
}

function mountComposer(upload: (repo: string, file: File) => Promise<UploadResult>) {
  const onUploadError = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(PhoneComposer, {
        draftKey: 'phone-draft:pr-1',
        title: 'Comment',
        submitLabel: 'Comment',
        writesOff: false,
        busy: false,
        onSubmit: () => {},
        onClose: () => {},
        repo: 'acme-web',
        onUploadError,
        upload,
      }),
    ),
  );
  const box = host.querySelector('textarea');
  if (!box) throw new Error('no field');
  return { box, onUploadError };
}

function setText(box: HTMLTextAreaElement, text: string, caret = text.length): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  box.setSelectionRange(caret, caret);
}

/** Fires a paste carrying `files` and, optionally, plain text. Returns whether the default was prevented. */
function paste(box: HTMLTextAreaElement, files: File[], text = ''): boolean {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', {
    value: { files, getData: (t: string) => (t === 'text/plain' ? text : '') },
  });
  act(() => {
    box.dispatchEvent(e);
  });
  return e.defaultPrevented;
}

function drop(box: HTMLTextAreaElement, files: File[]): boolean {
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'] } });
  act(() => {
    box.dispatchEvent(e);
  });
  return e.defaultPrevented;
}

const png = (name = 'image.png', size = 64) => new File([new Uint8Array(size)], name, { type: 'image/png' });

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('pasting an image into a comment box', () => {
  it('shows a placeholder at the cursor, then swaps in the markdown', async () => {
    const { upload, settle } = deferredUpload();
    const { box } = mountComposer(upload);
    setText(box, 'before after', 7);

    expect(paste(box, [png('shot.png')])).toBe(true);
    expect(box.value).toBe('before ![Uploading shot.png...]()after');
    expect(upload).toHaveBeenCalledWith('acme-web', expect.any(File));

    settle().resolve({ url: ASSET });
    await flush();
    expect(box.value).toBe(`before ![shot](${ASSET})after`);
    expect(window.localStorage.getItem('phone-draft:pr-1')).toBe(box.value);
  });

  it('removes the placeholder and reports the error when the upload fails', async () => {
    const { upload, settle } = deferredUpload();
    const { box, onUploadError } = mountComposer(upload);
    setText(box, 'note ');

    paste(box, [png()]);
    settle().reject(new Error('Uploading images needs write access to this repository'));
    await flush();
    expect(box.value).toBe('note ');
    expect(onUploadError).toHaveBeenCalledWith(
      'Could not upload image.png: Uploading images needs write access to this repository',
    );
  });

  it('refuses a type outside png, jpeg, gif and webp without uploading', () => {
    const upload = vi.fn();
    const { box, onUploadError } = mountComposer(upload);
    const pdf = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });

    expect(paste(box, [pdf])).toBe(true);
    expect(box.value).toBe('');
    expect(upload).not.toHaveBeenCalled();
    expect(onUploadError).toHaveBeenCalledWith('spec.pdf is not a PNG, JPEG, GIF or WebP image');
  });

  it('refuses an image over 10 MB without uploading', () => {
    const upload = vi.fn();
    const { box, onUploadError } = mountComposer(upload);

    paste(box, [png('huge.png', UPLOAD_MAX_BYTES + 1)]);
    expect(upload).not.toHaveBeenCalled();
    expect(onUploadError).toHaveBeenCalledWith('huge.png is over 10 MB');
  });

  it('leaves a text paste to the browser, even when the clipboard also holds an image', () => {
    const upload = vi.fn();
    const { box, onUploadError } = mountComposer(upload);

    expect(paste(box, [], 'plain words')).toBe(false);
    expect(paste(box, [png()], 'a table cell')).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(onUploadError).not.toHaveBeenCalled();
  });

  it('uploads a dropped image the same way', async () => {
    const { upload, settle } = deferredUpload();
    const { box } = mountComposer(upload);

    expect(drop(box, [png('drop.png')])).toBe(true);
    expect(box.value).toBe('![Uploading drop.png...]()');
    settle().resolve({ url: ASSET });
    await flush();
    expect(box.value).toBe(`![drop](${ASSET})`);
  });
});

describe('desktop review dialog', () => {
  it('uploads a pasted image against the PR repo', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const pr = { repo: 'acme-api', number: 7, title: 'Fix it' } as PrSummary;
    act(() =>
      root?.render(
        createElement(ActionDialog, {
          kind: 'comment',
          pr,
          methodLabel: 'Squash',
          busy: false,
          onConfirm: () => {},
          onCancel: () => {},
          onUploadError: () => {},
        }),
      ),
    );
    const box = host.querySelector('textarea');
    if (!box) throw new Error('no field');
    paste(box, [png('dialog.png')]);
    expect(box.value).toBe('![Uploading dialog.png...]()');
    expect(String(spy.mock.calls[0]?.[0])).toBe('/api/upload-image?repo=acme-api&name=dialog.png');
    spy.mockRestore();
  });
});
