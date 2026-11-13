import type { ReactNode } from 'react';
import { STATUS_KEYS, type StatusOptionKey } from '../../shared/settings';
import { Btn } from '../ui';
import type { FieldErrors, FormState, SectionId } from './form';
import { PaneErrors, Switch, TextField } from './SettingsFields';

export interface PaneProps {
  form: FormState;
  errors: FieldErrors;
  /** Merges a change into the form. */
  patch: (change: Partial<FormState>) => void;
  /** Enter in a field: saves when Save is enabled. */
  onEnter: () => void;
}

const STATUS_LABELS: Record<StatusOptionKey, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  inProgress: 'In progress',
  inReview: 'In review',
  done: 'Done',
};

function Pane({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="settings-pane-body" aria-label={title}>
      <h3>{title}</h3>
      <p className="settings-caption">{caption}</p>
      {children}
    </section>
  );
}

function GithubPane({ form, errors, patch, onEnter }: PaneProps) {
  const setOrg = (i: number, value: string) => patch({ orgs: form.orgs.map((o, j) => (j === i ? value : o)) });
  return (
    <Pane title="GitHub" caption="Orgs Nod watches for PRs and issues. Leave the list empty to watch only your own repos.">
      <div className="field-label settings-orgs-label">Orgs</div>
      {form.orgs.map((org, i) => (
        <div className="settings-org-row" key={i}>
          <TextField
            path={`orgs.${i}`}
            label={`Org ${i + 1}`}
            hideLabel
            className="settings-org-field"
            value={org}
            errors={errors}
            onChange={(v) => setOrg(i, v)}
            onEnter={onEnter}
            placeholder="e.g. acme-web"
          />
          <Btn aria-label={`Remove ${org || `org ${i + 1}`}`} onClick={() => patch({ orgs: form.orgs.filter((_, j) => j !== i) })}>
            × Remove
          </Btn>
        </div>
      ))}
      <Btn className="settings-add" onClick={() => patch({ orgs: [...form.orgs, ''] })}>
        + Add org
      </Btn>
      <p className="settings-help">No orgs is fine. Nod then shows only PRs and issues that involve you.</p>
      <PaneErrors errors={errors} roots={['orgs']} />
    </Pane>
  );
}

function BotPane({ form, errors, patch, onEnter }: PaneProps) {
  const bot = form.bot;
  const set = (change: Partial<FormState['bot']>) => patch({ bot: { ...bot, ...change } });
  const colour = /^[0-9a-f]{6}$/i.test(bot.labelColor) ? `#${bot.labelColor}` : undefined;
  return (
    <Pane title="Bot" caption="A GitHub Action or app that fixes checks when a PR comment starts with its command.">
      <Switch label="Comment bot" on={bot.enabled} onChange={(enabled) => set({ enabled })} />
      <div className="settings-grid">
        <TextField path="bot.name" label="Name" value={bot.name} errors={errors} onChange={(name) => set({ name })} onEnter={onEnter} />
        <TextField path="bot.command" label="Command" value={bot.command} errors={errors} onChange={(command) => set({ command })} onEnter={onEnter} />
        <TextField path="bot.label" label="Issue label" value={bot.label} errors={errors} onChange={(label) => set({ label })} onEnter={onEnter} />
        <TextField
          path="bot.labelColor"
          label="Label colour"
          value={bot.labelColor}
          errors={errors}
          onChange={(labelColor) => set({ labelColor })}
          onEnter={onEnter}
        >
          {(input) => (
            <div className="settings-colour">
              <span className="settings-swatch" style={colour ? { background: colour } : undefined} aria-hidden="true" />
              {input}
            </div>
          )}
        </TextField>
        <TextField path="bot.login" label="Bot GitHub login" value={bot.login} errors={errors} onChange={(login) => set({ login })} onEnter={onEnter} />
        <TextField path="bot.marker" label="Comment marker" value={bot.marker} errors={errors} onChange={(marker) => set({ marker })} onEnter={onEnter} />
      </div>
      <PaneErrors errors={errors} roots={['bot']} />
    </Pane>
  );
}

function ProjectPane({ form, errors, patch, onEnter }: PaneProps) {
  return (
    <Pane title="Project board" caption="The GitHub Projects board Nod moves issues across. Status names must match the board's options.">
      <div className="settings-grid">
        <TextField path="project.number" label="Project number" value={form.projectNumber} errors={errors} onChange={(projectNumber) => patch({ projectNumber })} onEnter={onEnter} />
        <TextField path="project.statusField" label="Status field" value={form.statusField} errors={errors} onChange={(statusField) => patch({ statusField })} onEnter={onEnter} />
        {STATUS_KEYS.map((key) => (
          <TextField
            key={key}
            path={`project.options.${key}`}
            label={STATUS_LABELS[key]}
            value={form.options[key]}
            errors={errors}
            onChange={(v) => patch({ options: { ...form.options, [key]: v } })}
            onEnter={onEnter}
          />
        ))}
      </div>
      <PaneErrors errors={errors} roots={['project']} />
    </Pane>
  );
}

function ReleasePane({ form, errors, patch, onEnter }: PaneProps) {
  const set = (change: Partial<FormState['releaseMerge']>) => patch({ releaseMerge: { ...form.releaseMerge, ...change } });
  return (
    <Pane title="Release merge" caption="A PR from head into base whose title contains the text is treated as a release.">
      <div className="settings-grid">
        <TextField path="releaseMerge.base" label="Base branch" value={form.releaseMerge.base} errors={errors} onChange={(base) => set({ base })} onEnter={onEnter} />
        <TextField path="releaseMerge.head" label="Head branch" value={form.releaseMerge.head} errors={errors} onChange={(head) => set({ head })} onEnter={onEnter} />
        <TextField
          path="releaseMerge.titleContains"
          label="Title contains"
          className="settings-wide"
          value={form.releaseMerge.titleContains}
          errors={errors}
          onChange={(titleContains) => set({ titleContains })}
          onEnter={onEnter}
        />
      </div>
      <PaneErrors errors={errors} roots={['releaseMerge']} />
    </Pane>
  );
}

function OrcaPane({ form, errors, patch, onEnter }: PaneProps) {
  return (
    <Pane title="Orca agents" caption="The agents Dispatch with Orca offers, in menu order. Lowercase ids, separated by commas.">
      <div className="settings-grid">
        <TextField path="orcaAgents" label="Agents" className="settings-wide" value={form.orcaAgents} errors={errors} onChange={(orcaAgents) => patch({ orcaAgents })} onEnter={onEnter} />
      </div>
      <PaneErrors errors={errors} roots={['orcaAgents']} />
    </Pane>
  );
}

function PhonePane({ form, errors, patch, onEnter }: PaneProps) {
  return (
    <Pane title="Phone and push" caption="Web Push contact and the Android app's package ID. Pair phones from the phone button in the top bar.">
      <div className="settings-grid">
        <TextField path="push.contact" label="Push contact" className="settings-wide" value={form.pushContact} errors={errors} onChange={(pushContact) => patch({ pushContact })} onEnter={onEnter} />
        <TextField path="android.packageId" label="Android package ID" className="settings-wide" value={form.androidPackageId} errors={errors} onChange={(androidPackageId) => patch({ androidPackageId })} onEnter={onEnter} />
      </div>
      <PaneErrors errors={errors} roots={['push', 'android']} />
    </Pane>
  );
}

const PANES: Record<SectionId, (p: PaneProps) => ReactNode> = {
  github: GithubPane,
  bot: BotPane,
  project: ProjectPane,
  release: ReleasePane,
  orca: OrcaPane,
  phone: PhonePane,
};

export function SettingsPane({ section, ...props }: PaneProps & { section: SectionId }) {
  const Render = PANES[section];
  return <>{Render(props)}</>;
}
