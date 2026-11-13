import { STATE_WORD, type SessionState, type SessionView } from '../../shared/orca-sessions';

/** Longest a session name draws in a chip before the ellipsis. */
export const CHIP_NAME_MAX_PX = 96;

interface GlyphProps {
  state: SessionState | 'many';
  size?: number;
}

/**
 * State by shape, never colour alone: filled circle (working), diamond (waiting), ring (done),
 * dashed ring (unknown), two rings (several sessions).
 */
export function StateGlyph({ state, size = 12 }: GlyphProps) {
  const common = { width: state === 'many' ? size + 2 : size, height: size, fill: 'none', 'aria-hidden': true } as const;
  switch (state) {
    case 'working':
      return (
        <svg {...common} viewBox="0 0 12 12" className="orca-glyph">
          <circle cx="6" cy="6" r="5" fill="currentColor" />
        </svg>
      );
    case 'waiting':
      return (
        <svg {...common} viewBox="0 0 12 12" className="orca-glyph">
          <path d="M6 0.9L11.1 6 6 11.1 0.9 6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'done':
      return (
        <svg {...common} viewBox="0 0 12 12" className="orca-glyph">
          <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'unknown':
      return (
        <svg {...common} viewBox="0 0 12 12" className="orca-glyph">
          <circle cx="6" cy="6" r="4.8" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.2 1.8" />
        </svg>
      );
    case 'many':
      return (
        <svg {...common} viewBox="0 0 14 12" className="orca-glyph">
          <circle cx="4.6" cy="6" r="3.7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="9.4" cy="6" r="3.7" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
  }
}

/** `output 12s ago`, `output 3m ago`, `output 2h ago`. */
export function outputAgo(at: number | undefined, now: number = Date.now()): string | undefined {
  if (at === undefined) return undefined;
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `output ${s}s ago`;
  if (s < 3600) return `output ${Math.floor(s / 60)}m ago`;
  return `output ${Math.floor(s / 3600)}h ago`;
}

export type ChipInput = { kind: 'one'; session: Pick<SessionView, 'name' | 'state'> } | { kind: 'many'; count: number };

/**
 * The row chip: glyph, mono session name, state word. The word never truncates; the name
 * ellipsizes at 96px and hides below 1399px (CSS). It is not clickable, the row click selects the PR.
 */
export function OrcaChip({ input }: { input: ChipInput }) {
  if (input.kind === 'many') {
    const label = `${input.count} sessions`;
    return (
      <span className="ci orca-chip orca-chip-many" aria-label={`${label} match this PR`} title={`${label} match this PR`}>
        <StateGlyph state="many" />
        <span className="orca-chip-word">{label}</span>
      </span>
    );
  }
  const { name, state } = input.session;
  const text = `Orca session ${name}, ${STATE_WORD[state]}`;
  return (
    <span className={`ci orca-chip orca-chip-${state}`} aria-label={text} title={text}>
      <StateGlyph state={state} />
      <span className="orca-chip-name">{name}</span>
      <span className="orca-chip-word">{STATE_WORD[state]}</span>
    </span>
  );
}
