import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@primer/octicons-react';
import { LOCAL_HOST, type HostStatus } from '../../shared/orca-hosts';
import { agoShort, hostLabel, hostMenu, isRemote, offlineNotes, seenAgo } from './hosts';
import type { HostChoice } from './OrcaContext';
import { StateGlyph } from './orca-ui';

/** The host pill on a session row. Nothing for `local`, so one machine looks as before hosts. */
export function HostTag({ host, className = 'orca-host-tag' }: { host: string; className?: string }) {
  return isRemote(host) ? <span className={className}>{host}</span> : null;
}

/** One muted line per offline host under a session list. */
export function OfflineNote({ hosts, className = 'orca-offline-note' }: { hosts: readonly HostStatus[]; className?: string }) {
  const lines = offlineNotes(hosts);
  return lines.length > 0 ? (
    <div className={className}>
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  ) : null;
}

/** The repo's host is offline, so the worktree goes to `local`. Nothing is queued for later. */
export function HostFallback({ fallback }: { fallback: HostStatus | undefined }) {
  return fallback ? (
    <p className="orca-host-fallback">
      <AlertIcon size={14} />
      <span>{`This repo usually runs on ${fallback.name}, which is offline (${seenAgo(fallback)}).`}</span>
    </p>
  ) : null;
}

export const offlineRight = (h: HostStatus): string => (h.lastSeen === null ? 'offline' : `offline · ${agoShort(h.lastSeen)} ago`);

/** The worktree host a dialog starts on, the user's pick once made, and the fallback line while it is not. */
export function useWorktreeHost(choice: HostChoice | undefined) {
  const [picked, setPicked] = useState<string>();
  const host = picked ?? choice?.host ?? LOCAL_HOST;
  const pick = (h: string): void => {
    setPicked(h);
    choice?.pick(h);
  };
  return {
    multi: choice?.multi === true,
    hosts: choice?.hosts ?? [],
    host,
    fallback: picked === undefined ? choice?.fallback : undefined,
    pick,
  };
}

export type WorktreeHost = ReturnType<typeof useWorktreeHost>;

interface SelectProps {
  hosts: readonly HostStatus[];
  value: string;
  disabled?: boolean;
  label: string;
  onPick: (host: string) => void;
}

/**
 * A select for the worktree host. The menu lists online hosts first and offline hosts greyed
 * and not focusable. Arrows move, Enter picks, Esc closes the menu only.
 */
export function HostSelect({ hosts, value, disabled, label, onPick }: SelectProps) {
  const [open, setOpen] = useState(false);
  const { online, offline } = hostMenu(hosts);
  const [focus, setFocus] = useState(0);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setFocus(Math.max(0, online.findIndex((h) => h.name === value)));
    menu.current?.focus({ preventScroll: true });
    const away = (e: MouseEvent) => {
      if (!menu.current?.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
    // Runs on opening only, so a host-list poll does not move the focus.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (name: string) => {
    onPick(name);
    close();
  };

  return (
    <span className="orca-host-select">
      <button
        ref={button}
        type="button"
        className="orca-host-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${hostLabel(value, hosts)}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="orca-host-value">{hostLabel(value, hosts)}</span>
        {open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
      </button>
      {open ? (
        <div
          ref={menu}
          className="orca-host-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`orca-host-${online[focus]?.name ?? ''}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              setFocus((f) => Math.min(online.length - 1, Math.max(0, f + (e.key === 'ArrowDown' ? 1 : -1))));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              const h = online[focus];
              if (h) pick(h.name);
            }
          }}
        >
          {online.map((h, i) => (
            <div
              key={h.name}
              id={`orca-host-${h.name}`}
              role="option"
              aria-selected={h.name === value}
              className={`orca-host-row${h.name === value ? ' is-on' : ''}${i === focus ? ' is-focus' : ''}`}
              onMouseEnter={() => setFocus(i)}
              onClick={() => pick(h.name)}
            >
              <span className="orca-host-row-name">{hostLabel(h.name, hosts)}</span>
              {h.name === value ? <CheckIcon size={14} /> : null}
            </div>
          ))}
          {offline.length > 0 ? (
            <>
              <div className="orca-host-divider" role="separator" />
              {offline.map((h) => (
                <div key={h.name} role="option" aria-disabled="true" aria-selected={false} className="orca-host-row is-offline">
                  <StateGlyph state="unknown" />
                  <span className="orca-host-row-name">{h.name}</span>
                  <span className="orca-host-row-right">{offlineRight(h)}</span>
                </div>
              ))}
              <p className="orca-host-foot">Offline hosts cannot be picked.</p>
            </>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

interface RowProps {
  hosts: readonly HostStatus[];
  host: string;
  on: boolean;
  busy?: boolean;
  /** A radio before the name, when the row sits in a list of sessions. */
  radio?: boolean;
  onSelect?: () => void;
  onPick: (host: string) => void;
}

/** `New worktree on [host]`: the row that starts a fresh worktree on the chosen host. */
export function NewWorktreeRow({ hosts, host, on, busy, radio, onSelect, onPick }: RowProps) {
  return (
    <div
      role={radio ? 'option' : undefined}
      aria-selected={radio ? on : undefined}
      className={`picker-row orca-new-row${on ? ' is-focus' : ''}`}
      onClick={() => !busy && onSelect?.()}
    >
      {radio ? <span className={`picker-radio${on ? ' is-on' : ''}`} aria-hidden="true" /> : null}
      <span className="mono orca-new-name">New worktree</span>
      {hosts.length > 1 ? (
        <>
          <span className="orca-new-on">on</span>
          <HostSelect hosts={hosts} value={host} disabled={busy} label="Run the new worktree on" onPick={onPick} />
        </>
      ) : null}
    </div>
  );
}
