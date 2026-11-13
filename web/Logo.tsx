/** The app mark, drawn from electron/assets/icon.svg so it stays crisp at every size. */
export function Logo({ size }: { size: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0d1117" />
      <rect x="76" y="94" width="190" height="82" rx="41" fill="#6e7681" />
      <rect x="76" y="215" width="360" height="82" rx="41" fill="#3fb950" />
      <rect x="76" y="336" width="270" height="82" rx="41" fill="#f85149" />
      <g stroke="#0d1117" strokeWidth="16" strokeLinecap="round" fill="none">
        <path d="M99 256H141M120 235V277" />
        <path d="M99 377H141" />
      </g>
    </svg>
  );
}

/** An empty detail pane (docs/design/logo-wireframe-A.png): the mark, what to do, and the keys for it. */
export function EmptyPane({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-pane">
      <Logo size={64} />
      <div className="empty-pane-title">{title}</div>
      {hint ? <div className="empty-pane-hint">{hint}</div> : null}
    </div>
  );
}
