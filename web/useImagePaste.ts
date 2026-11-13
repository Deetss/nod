import { useCallback, useRef, type ClipboardEvent, type DragEvent } from 'react';
import { imageMarkdown, uploadProblem, type UploadResult } from '../shared/image-upload';
import { api } from './api';

export interface ImagePasteOptions {
  /** The org repo the comment belongs to. Without one, images are refused. */
  repo: string | undefined;
  /** Applies an edit to the field's latest text. */
  update: (edit: (text: string) => string) => void;
  onError: (message: string) => void;
  upload?: (repo: string, file: File) => Promise<UploadResult>;
}

export interface ImagePasteHandlers {
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop: (e: DragEvent<HTMLTextAreaElement>) => void;
  onDragOver: (e: DragEvent<HTMLTextAreaElement>) => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Upload failed');

/**
 * Pasting or dropping an image into a comment box uploads it and writes `![name](url)` at the
 * cursor, as github.com does. A placeholder holds the spot until the upload finishes. A paste
 * that carries plain text is left to the browser, so copying from a document still pastes text.
 */
export function useImagePaste(o: ImagePasteOptions): ImagePasteHandlers {
  const { repo, update, onError } = o;
  const upload = o.upload ?? api.uploadImage;
  const count = useRef(0);

  const insert = useCallback(
    (el: HTMLTextAreaElement, files: File[]) => {
      const bad = files.map(uploadProblem).find((m) => m !== undefined);
      if (bad) return onError(bad);
      if (!repo) return onError('Choose a repository before adding images');

      const jobs = files.map((file) => {
        count.current += 1;
        const label = count.current === 1 ? file.name : `${file.name} (${count.current})`;
        return { file, placeholder: `![Uploading ${label}...]()` };
      });
      const added = jobs.map((j) => j.placeholder).join('\n');
      const start = el.selectionStart;
      const end = el.selectionEnd;
      update((t) => t.slice(0, start) + added + t.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(start + added.length, start + added.length));

      for (const { file, placeholder } of jobs) {
        upload(repo, file).then(
          ({ url }) => update((t) => t.replace(placeholder, imageMarkdown(file.name, url))),
          (e: unknown) => {
            update((t) => t.replace(placeholder, ''));
            onError(`Could not upload ${file.name}: ${errorText(e)}`);
          },
        );
      }
    },
    [repo, update, onError, upload],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const data = e.clipboardData;
      if (data.getData('text/plain') !== '' || data.files.length === 0) return;
      e.preventDefault();
      insert(e.currentTarget, Array.from(data.files));
    },
    [insert],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      insert(e.currentTarget, Array.from(e.dataTransfer.files));
    },
    [insert],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  }, []);

  return { onPaste, onDrop, onDragOver };
}
