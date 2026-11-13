import { useEffect, useRef } from 'react';
import type { DiffData, FileItem } from '../../shared/types';
import { HunkLines } from '../DiffFileView';
import { splitPath } from '../FilesTree';
import { CheckIcon } from '../ui';
import type { Remote } from '../useRemote';
import { PhoneSheet } from './PhoneSheet';
import { nextUnviewed } from './phone-logic';

interface DiffSheetProps {
  files: FileItem[];
  diff: Remote<DiffData>;
  path: string;
  prUrl: string;
  wrap: boolean;
  writesOff: boolean;
  depth: number;
  covered: boolean;
  onWrap: () => void;
  onSelect: (path: string) => void;
  onViewed: (path: string, viewed: boolean) => void;
  onClose: () => void;
  onMore: () => void;
}

export function PhoneDiffSheet(p: DiffSheetProps) {
  const index = Math.max(0, p.files.findIndex((f) => f.path === p.path));
  const file = p.files[index];
  const last = index >= p.files.length - 1;
  const data = p.diff.data?.files.find((f) => f.path === p.path);
  const yaml = /\.ya?ml$/.test(p.path);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector('.is-current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [p.path]);

  const markViewed = () => {
    if (!file) return;
    p.onViewed(file.path, !file.viewed);
    if (file.viewed) return;
    const next = nextUnviewed(p.files, file.path);
    if (next) p.onSelect(next);
  };
  const next = () => (last ? p.onClose() : p.onSelect(p.files[index + 1]?.path ?? p.path));

  return (
    <PhoneSheet
      title={splitPath(p.path).name}
      sub={`${splitPath(p.path).dir} · ${index + 1} / ${p.files.length} files`}
      depth={p.depth}
      covered={p.covered}
      onClose={p.onClose}
      onMore={p.onMore}
      bodyScrolls={false}
      pinned={
        <div className="ph-filestrip" ref={strip}>
          {p.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`ph-fchip${f.path === p.path ? ' is-current' : ''}`}
              onClick={() => p.onSelect(f.path)}
            >
              {splitPath(f.path).name}
              {f.viewed ? <CheckIcon size={14} /> : null}
            </button>
          ))}
        </div>
      }
      bar={
        <>
          <button type="button" className="ph-btn is-narrow" aria-pressed={p.wrap} onClick={p.onWrap}>
            <span className={`ph-switch${p.wrap ? ' is-on' : ''}`} aria-hidden="true" />
            Wrap
          </button>
          <button
            type="button"
            className={`ph-btn${file?.viewed ? '' : ' is-primary'}${p.writesOff ? ' is-off' : ''}`}
            disabled={p.writesOff || !file}
            onClick={markViewed}
          >
            {file?.viewed ? 'Viewed' : 'Mark viewed'}
            {file?.viewed ? <CheckIcon size={16} /> : null}
          </button>
          <button type="button" className="ph-btn is-narrow" onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        </>
      }
    >
      <div className={`ph-diff${p.wrap ? ' diff-wrap' : ''}`} tabIndex={0}>
        {p.diff.error && !data ? <p className="ph-pad ph-muted">{p.diff.error}</p> : null}
        {!data && !p.diff.error ? <p className="ph-pad ph-muted">Loading…</p> : null}
        {data?.noPatch ? (
          <p className="ph-pad ph-muted">
            No diff to show (binary or too large).{' '}
            <a href={`${p.prUrl}/files`} target="_blank" rel="noreferrer">
              Open files on GitHub
            </a>
          </p>
        ) : (
          <div className="dl-table">
            {data?.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="dl-hunk mono">
                  <span className="dl-hunk-text" title={h.header}>
                    {h.header}
                  </span>
                </div>
                <HunkLines lines={h.lines} yaml={yaml} />
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneSheet>
  );
}
