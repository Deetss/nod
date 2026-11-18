import { useState } from 'react';
import type { HubStatus } from '../../shared/hub';
import { LOCAL_HOST, type HostStatus } from '../../shared/orca-hosts';
import { AlertIcon, Btn, XIcon } from '../ui';
import { FieldError } from './SettingsFields';
import { hasPairedHosts, useHostPrefs } from './useHostPrefs';
import { hubRole, type HubState } from './useHub';

export const HUB_SAVED_NOTE = 'Saved on the hub. Admin desktops only.';
export const HUB_LOCAL_NOTE = 'The Hub URL is saved on this desktop. Hosts are saved on this machine.';
const READ_ONLY_NOTE = 'Ask an admin device to change this.';

function pillOf(status: HubStatus): { tone: 'success' | 'attention' | 'danger'; label: string } {
  if (status.state === 'unreachable') return { tone: 'danger', label: 'Unreachable' };
  if (status.state === 'not-paired') return { tone: 'attention', label: 'Reachable · not paired' };
  const version = status.version ? ` · v${status.version}` : '';
  return { tone: 'success', label: `Reachable · paired as ${status.role}${version}` };
}

/** Each tone has its own mark, so colour never carries the state alone. */
function HubPill({ hub }: { hub: HubState }) {
  if (hub.phase.kind === 'checking') {
    return (
      <span className="conn-pill is-neutral hub-pill" role="status">
        <span className="spinner" aria-hidden="true" />
        Checking...
      </span>
    );
  }
  if (hub.phase.kind !== 'status') return null;
  const { tone, label } = pillOf(hub.phase.status);
  return (
    <span className={`conn-pill is-${tone} hub-pill`} role="status">
      {tone === 'success' ? <span className="hub-dot" aria-hidden="true" /> : tone === 'attention' ? <AlertIcon size={12} /> : <XIcon size={12} />}
      {label}
    </span>
  );
}

function PairRow({ hub }: { hub: HubState }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  if (!open) {
    return (
      <div className="hub-pair-row">
        <Btn className="hub-pair" onClick={() => setOpen(true)}>
          Pair this desktop
        </Btn>
        <span className="settings-caption">Shown until this desktop is paired.</span>
      </div>
    );
  }
  const submit = () => void hub.pair(input).then((ok) => ok && setOpen(false));
  return (
    <div className="hub-pair-row">
      <input
        className="hub-pair-input"
        aria-label="Pairing link or code"
        placeholder="Link or code from nod pair --admin on the hub"
        value={input}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <Btn primary disabled={hub.pairing || input.trim() === ''} aria-busy={hub.pairing || undefined} onClick={submit}>
        {hub.pairing ? <span className="spinner" aria-hidden="true" /> : null}
        Pair
      </Btn>
      <Btn disabled={hub.pairing} onClick={() => setOpen(false)}>
        Cancel
      </Btn>
    </div>
  );
}

interface HostSelectProps {
  label: string;
  value: string;
  hosts: readonly HostStatus[];
  localLabel: string;
  /** The `Default` choice of a repo row. */
  withDefault?: boolean;
  disabled: boolean;
  className: string;
  onChange: (host: string) => void;
}

/** Offline hosts cannot be picked; a chosen one stays selected, dashed and marked offline. */
function HostSelect(p: HostSelectProps) {
  const chosen = p.hosts.find((h) => h.name === p.value);
  const offline = chosen !== undefined && !chosen.online;
  const name = (h: HostStatus) => (h.name === LOCAL_HOST ? p.localLabel : h.name);
  const cls = [p.className, offline ? 'is-offline' : '', p.withDefault && p.value === '' ? 'is-default' : ''].filter(Boolean).join(' ');
  return (
    <select aria-label={p.label} className={cls} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)}>
      {p.withDefault ? <option value="">Default</option> : null}
      {p.hosts.map((h) => (
        <option key={h.name} value={h.name} disabled={!h.online && h.name !== p.value}>
          {h.online ? name(h) : `${name(h)} · offline`}
        </option>
      ))}
      {p.value && !chosen ? <option value={p.value}>{`${p.value} · offline`}</option> : null}
    </select>
  );
}

interface HostsSectionProps {
  readOnly: boolean;
  repos: readonly string[];
  /** Without a hub, the section shows only when this machine's Orca has paired environments. */
  needsPairedHosts: boolean;
}

function HostsSection({ readOnly, repos, needsPairedHosts }: HostsSectionProps) {
  const h = useHostPrefs();
  const localHosts = hasPairedHosts(h.hosts);
  const localLabel = localHosts ? 'local (hub)' : 'This machine';
  if (needsPairedHosts && !localHosts) return null;
  return (
    <section className="hub-hosts" aria-label="Orca hosts">
      <div className="hub-section-title">Orca hosts</div>
      <p className="settings-caption">Where a new worktree runs when you do not pick one.</p>
      {readOnly ? <p className="settings-caption hub-readonly">{READ_ONLY_NOTE}</p> : null}
      {h.hosts && h.prefs ? (
        <>
          <label className="hub-default-row">
            <span>Default host</span>
            <HostSelect
              label="Default host"
              className="hub-default-select"
              value={h.prefs.defaultHost ?? LOCAL_HOST}
              hosts={h.hosts}
              localLabel={localLabel}
              disabled={readOnly || h.saving === 'default'}
              onChange={h.setDefault}
            />
          </label>
          <div className="hub-table" role="table" aria-label="Host per repo">
            <div className="hub-table-head" role="row">
              <span role="columnheader">REPO</span>
              <span role="columnheader">HOST</span>
            </div>
            <div className="hub-table-body">
              {repos.length === 0 ? <p className="settings-caption hub-table-empty">No repos in the inbox yet.</p> : null}
              {repos.map((repo) => (
                <div className="hub-table-row" role="row" key={repo}>
                  <span className="hub-repo" role="cell">
                    {repo}
                  </span>
                  <span role="cell">
                    <HostSelect
                      label={`Host for ${repo}`}
                      className="hub-repo-select"
                      withDefault
                      value={h.prefs?.hosts[repo] ?? ''}
                      hosts={h.hosts ?? []}
                      localLabel={localLabel}
                      disabled={readOnly || h.saving === repo}
                      onChange={(host) => h.setRepo(repo, host)}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : h.error ? null : (
        <p className="settings-caption">Loading hosts...</p>
      )}
      {h.error ? <FieldError id="hub-hosts-error" message={h.error} /> : null}
    </section>
  );
}

interface HubPaneBodyProps {
  hub: HubState;
  /** Repos seen in the inbox, lower case. */
  repos: readonly string[];
}

/** Settings > Hub below the title: Hub URL, its status, pairing, and the Orca hosts. */
export function HubPaneBody({ hub, repos }: HubPaneBodyProps) {
  const role = hubRole(hub);
  const editable = hub.source?.editable === true;
  const paired = hub.phase.kind === 'status' && hub.phase.status.state === 'paired';
  const showPair = editable && hub.phase.kind === 'status' && hub.phase.status.state === 'not-paired';
  const showHosts = hub.attached ? role !== undefined : hub.phase.kind === 'empty';
  return (
    <>
      <div className="field-label hub-label">Hub URL</div>
      {hub.source ? (
        <>
          <div className="hub-url-row">
            <input
              className="hub-url"
              aria-label="Hub URL"
              placeholder="https://hub.example.ts.net"
              value={hub.draft}
              readOnly={!editable}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => hub.setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') hub.check();
              }}
            />
            <Btn className="hub-check" disabled={hub.phase.kind === 'checking'} onClick={hub.check}>
              Check
            </Btn>
          </div>
          {hub.error ? <FieldError id="hub-url-error" message={hub.error} /> : null}
          {hub.phase.kind === 'checking' || hub.phase.kind === 'status' ? (
            <div className="hub-status-row">
              <HubPill hub={hub} />
              {!editable && paired ? <span className="settings-caption">To change the hub, start Nod with nod --local.</span> : null}
            </div>
          ) : null}
          {showPair ? <PairRow hub={hub} /> : null}
        </>
      ) : (
        <p className="settings-caption">The Hub URL is a desktop app setting.</p>
      )}
      {showHosts ? <HostsSection readOnly={hub.attached && role !== 'admin'} repos={repos} needsPairedHosts={!hub.attached} /> : null}

    </>
  );
}
