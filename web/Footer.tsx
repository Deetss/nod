import { useDensityValue } from './density';
import {
  FOOTER_ACTIVITY,
  FOOTER_COMFORTABLE,
  FOOTER_ISSUES_COMFORTABLE,
  FOOTER_ISSUES_NARROW,
  FOOTER_ISSUES_WIDE,
  FOOTER_NARROW,
  FOOTER_WIDE,
  type KeyDef,
} from './keys';
import type { ListView } from './list-view';
import { KeyCap } from './ui';

interface FooterProps {
  narrow: boolean;
  view: ListView;
  /** Hints a view adds for what is on screen now, such as the issue Orca strip. */
  extra?: readonly KeyDef[];
  /** Keys for the focused widget, shown instead of the view's own, such as a sub-issue row. */
  replace?: readonly KeyDef[];
}

export function Footer({ narrow, view, extra = [], replace }: FooterProps) {
  const comfortable = useDensityValue() === 'comfortable';
  const issues = view === 'issues';
  const wide = issues ? FOOTER_ISSUES_WIDE : FOOTER_WIDE;
  const tight = issues ? FOOTER_ISSUES_NARROW : FOOTER_NARROW;
  const pairs =
    view === 'activity'
      ? FOOTER_ACTIVITY
      : comfortable
        ? issues
          ? FOOTER_ISSUES_COMFORTABLE
          : FOOTER_COMFORTABLE
        : narrow
          ? tight
          : wide;
  return (
    <footer className="footer">
      {(replace ?? [...pairs, ...extra]).map((p) => (
        <span className="footer-pair" key={p.keys}>
          <KeyCap>{p.keys}</KeyCap>
          <span>{p.label}</span>
        </span>
      ))}
      {comfortable ? (
        <span className="footer-pair footer-all">
          <KeyCap>?</KeyCap>
          <span>all keys</span>
        </span>
      ) : null}
    </footer>
  );
}
