import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent } from 'react';
import { copyLink } from './phone/link-actions';
import type { ToastInput } from './toasts';
import { CheckIcon, LinkIcon } from './ui';

/** How long the button shows its check after a copy, ms. */
export const COPIED_MS = 1500;
/** How long the toast stays, ms. */
export const COPY_TOAST_MS = 2000;

/** Copies a URL and toasts the result. Resolves true when the copy worked. */
export type CopyUrl = (url: string) => Promise<boolean>;

/** Builds the copy function for a toast pusher. */
export function makeCopyUrl(push: (t: ToastInput) => void): CopyUrl {
  return async (url) => {
    const res = await copyLink(url);
    push({ kind: res.ok ? 'ok' : 'err', message: res.message, ms: COPY_TOAST_MS });
    return res.ok;
  };
}

/** Absent on the phone, where the action sheet has its own Copy link, so the buttons render nothing there. */
const CopyLinkContext = createContext<CopyUrl | undefined>(undefined);

export const CopyLinkProvider = CopyLinkContext.Provider;

export const useCopyUrl = (): CopyUrl | undefined => useContext(CopyLinkContext);

interface CopyLinkButtonProps {
  /** The GitHub URL to copy. Without one the button is left out. */
  url: string | undefined;
  /** `header` is the 28px bordered button, `inline` the 22px icon on rows, checks and comments. */
  variant?: 'header' | 'inline';
  className?: string;
}

/** Icon-only Copy link. Shows a check for a moment once the link is on the clipboard. */
export function CopyLinkButton({ url, variant = 'inline', className }: CopyLinkButtonProps) {
  const copy = useCopyUrl();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = useCallback(
    (e: MouseEvent) => {
      // A row or header behind the button must not select or open.
      e.stopPropagation();
      if (!copy || !url) return;
      void copy(url).then((ok) => {
        if (!ok) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      });
    },
    [copy, url],
  );

  if (!copy || !url) return null;
  const base = variant === 'header' ? 'btn icon-btn copy-link copy-link-header' : 'ext-link copy-link';
  return (
    <button
      type="button"
      className={`${base}${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      title="Copy link"
      aria-label={copied ? 'Link copied' : 'Copy link'}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {copied ? <CheckIcon size={variant === 'header' ? 16 : 14} /> : <LinkIcon size={variant === 'header' ? 16 : 14} />}
    </button>
  );
}
