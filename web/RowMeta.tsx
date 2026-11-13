import { formatMeta, type MetaParts } from './row-format';
import { repoLabel } from './repo-label';

/** The muted row meta line, with the `#number` bold. Reads the same as `formatMeta`. */
export function RowMeta(m: MetaParts) {
  const head = `${repoLabel(m.repo)} `;
  const num = `#${m.number}`;
  const rest = formatMeta(m).slice(head.length + num.length);
  return (
    <>
      {head}
      <span className="row-num">{num}</span>
      {rest}
    </>
  );
}
