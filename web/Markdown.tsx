import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { LinkRouterContext, parseItemLink } from './links';
import { sanitizeHtml } from './sanitize';
import { CheckIcon, CopyIcon } from './ui';

const COPIED_MS = 1500;

interface CodeBlock {
  pre: HTMLPreElement;
  host: HTMLElement;
}

/**
 * Wraps each code block in a positioned box with a slot for its copy button. The slot
 * sits beside the `pre`, not in it, so the button stays put when the code scrolls sideways.
 */
function mountCodeBlocks(root: HTMLElement): CodeBlock[] {
  return [...root.querySelectorAll('pre')].map((pre) => {
    const box = document.createElement('div');
    box.className = 'md-code';
    pre.before(box);
    box.append(pre);
    const host = document.createElement('span');
    host.className = 'md-code-slot';
    box.append(host);
    return { pre, host };
  });
}

type CopyState = 'idle' | 'copied' | 'failed';

interface CopyCodeButtonProps {
  pre: HTMLPreElement;
}

function CopyCodeButton({ pre }: CopyCodeButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), COPIED_MS);
    return () => clearTimeout(t);
  }, [state]);
  const copy = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(pre.textContent ?? '').then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };
  return (
    <button
      type="button"
      className="md-code-copy"
      aria-label="Copy code"
      data-state={state === 'idle' ? undefined : state}
      onClick={copy}
    >
      {state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {state !== 'idle' && <span aria-live="polite">{state === 'copied' ? 'Copied' : 'Copy failed'}</span>}
    </button>
  );
}

interface HtmlProps {
  html: string;
  className?: string;
}

/** The one place GitHub-rendered markdown enters the page, always sanitized first. */
export function Html({ html, className }: HtmlProps) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const route = useContext(LinkRouterContext);
  const ref = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<CodeBlock[]>([]);

  // React rewrites the inner HTML whenever `clean` changes, which drops the old wrappers.
  useLayoutEffect(() => {
    if (ref.current) setBlocks(mountCodeBlocks(ref.current));
  }, [clean]);

  const onClick = route
    ? (e: MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const a = e.target instanceof Element ? e.target.closest('a') : null;
        const link = a ? parseItemLink(a.getAttribute('href') ?? '') : undefined;
        if (link && route(link)) e.preventDefault();
      }
    : undefined;
  return (
    <>
      <div
        ref={ref}
        className={`md${className ? ` ${className}` : ''}`}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {blocks.map((b, i) => createPortal(<CopyCodeButton pre={b.pre} />, b.host, i))}
    </>
  );
}

interface PrBodyProps {
  body: string;
  bodyHtml?: string;
  className?: string;
}

/** A PR description. Falls back to the raw text for a cached detail saved before `bodyHtml` existed. */
export function PrBody({ body, bodyHtml, className }: PrBodyProps) {
  const empty = body.trim() === '';
  if (empty) return <p className="muted">No description.</p>;
  if (!bodyHtml) return <div className="desc-raw">{body}</div>;
  return <Html html={bodyHtml} className={`idetail-md pr-md${className ? ` ${className}` : ''}`} />;
}
