import { AlertFillIcon, CheckCircleFillIcon } from '@primer/octicons-react';
import type { ChipTone, Mark } from './model';

const MARK_LABELS: Record<Mark, string> = {
  ok: 'Working',
  off: 'Off or idle',
  checking: 'Checking',
  warn: 'Warning',
  broken: 'Broken',
  hub: 'This hub',
};

/** Filled disc, ring, dashed ring, triangle or circled `!`: the shape carries the state, colour repeats it. */
export function ConnMark({ mark, size = 12 }: { mark: Mark; size?: number }) {
  const style = { width: size, height: size };
  if (mark === 'warn') {
    return (
      <span className="cx-mark is-warn" style={style} role="img" aria-label={MARK_LABELS.warn}>
        <AlertFillIcon size={size} />
      </span>
    );
  }
  return (
    <span className={`cx-mark is-${mark}`} style={style} role="img" aria-label={MARK_LABELS[mark]}>
      {mark === 'broken' ? <span aria-hidden="true">!</span> : null}
    </span>
  );
}

/** The chip's leading glyph, by tone. */
export function ChipMark({ tone }: { tone: ChipTone }) {
  if (tone === 'ok') return <CheckCircleFillIcon size={12} className="cx-chip-icon is-ok" aria-hidden="true" />;
  if (tone === 'attention') return <AlertFillIcon size={12} className="cx-chip-icon is-attention" aria-hidden="true" />;
  const mark: Mark = tone === 'danger' ? 'broken' : tone === 'checking' ? 'checking' : 'off';
  return (
    <span className={`cx-mark is-${mark} cx-chip-icon`} aria-hidden="true">
      {mark === 'broken' ? '!' : null}
    </span>
  );
}
