import type { IssueDetail } from '../../shared/issue-types';
import { isProjectStatus, type ProjectStatus } from '../../shared/project-status';
import { bot, projectStatuses, statusOption } from '../org-settings';
import { useDensityValue } from '../density';
import { Btn, Chevron, KeyCap } from '../ui';
import { botHeld } from '../../shared/bot';
import { type Emphasis } from './bot-card';
import { Dropdown } from './Dropdown';
import { assignMe } from './issue-utils';
import { Avatar, Card, LabelChip, PrIcon, StatusChip } from './parts';
import { repoLabel } from '../repo-label';

interface CardsProps {
  detail: IssueDetail;
  disabled: boolean;
  onUnassign: (login: string) => void;
  onLabels: () => void;
  onAssign: () => void;
  onAssignMe: () => void;
  viewer: string | undefined;
  onMilestone: () => void;
  onOpenPr: (repo: string, number: number) => void;
  onOpenGithub: () => void;
  /** Borderless sidebar sections instead of cards (comfortable density only). */
  flat?: boolean;
  /** Project status controls; absent or disabled hides the Status card. */
  status?: {
    enabled: boolean;
    onSet: (status: ProjectStatus) => void;
    onStart: () => void;
    onStop: () => void;
  };
}

/** Status row: current chip, a dropdown of all five options, Start work and Stop work. */
function StatusCard(p: CardsProps) {
  const s = p.status;
  if (!s?.enabled) return null;
  const current = p.detail.summary.status ?? statusOption('backlog');
  return (
    <Card title="Status" hint={<><KeyCap>s</KeyCap> set</>}>
      <div className="status-row">
        <StatusChip status={current} />
        <Dropdown
          label="Change"
          shortLabel="Change"
          narrow
          active={false}
          value={current}
          options={projectStatuses().map((o) => ({ value: o, label: o }))}
          onChange={(v) => isProjectStatus(v, projectStatuses()) && s.onSet(v)}
        />
        {current === statusOption('inProgress') ? (
          <Btn keyHint="S" disabled={p.disabled} onClick={s.onStop}>
            Stop work
          </Btn>
        ) : (
          <Btn keyHint="S" disabled={p.disabled} onClick={s.onStart}>
            Start work
          </Btn>
        )}
      </div>
    </Card>
  );
}

/** The metadata cards. The sidebar and the narrow metadata sheet both show these. */
export function MetadataCards(p: CardsProps) {
  const d = p.detail;
  const me = assignMe(d.assignees, p.viewer);
  const flat = useDensityValue() === 'comfortable' && p.flat === true;
  if (flat) return <FlatCards {...p} />;
  return (
    <>
      <StatusCard {...p} />
      <Card title="Assignees" hint={<><KeyCap>a</KeyCap> choose</>}>
        {d.assignees.length === 0 ? (
          <span className="muted">No one assigned</span>
        ) : (
          d.assignees.map((a) => (
            <div className="person-row" key={a.login}>
              <Avatar login={a.login} url={a.avatarUrl} />
              <span>{a.login}</span>
              <button
                type="button"
                className="link-btn"
                disabled={p.disabled}
                onClick={() => p.onUnassign(a.login)}
              >
                unassign
              </button>
            </div>
          ))
        )}
        <div className="assign-actions">
          <Btn keyHint="A" disabled={p.disabled || !me.enabled} onClick={p.onAssignMe}>
            {me.label}
          </Btn>
          <Btn keyHint="a" disabled={p.disabled} onClick={p.onAssign}>
            Choose…
          </Btn>
        </div>
      </Card>
      <Card title="Labels" hint={<><KeyCap>l</KeyCap> open picker</>}>
        <div className="chip-row">
          {d.summary.labels.map((l) => (
            <LabelChip key={l.name} label={l} />
          ))}
          <button type="button" className="link-btn muted" disabled={p.disabled} onClick={p.onLabels}>
            + add / remove
          </button>
        </div>
      </Card>
      <Card title="Milestone" hint={<><KeyCap>m</KeyCap> set / clear</>}>
        <div className="milestone-row">
          <span>{d.milestone ?? <em className="muted">No milestone</em>}</span>
          <button type="button" className="btn" disabled={p.disabled} onClick={p.onMilestone}>
            Change <Chevron open size={14} />
          </button>
        </div>
      </Card>
      <Card
        title="Linked PRs"
        count={d.linkedPrs.length}
        hint={<><KeyCap>Enter</KeyCap> open in PR view</>}
      >
        {d.linkedPrs.length === 0 ? <span className="muted">No linked PRs</span> : null}
        {d.linkedPrs.map((pr) => (
          <button
            type="button"
            className="pr-link"
            key={`${pr.repo}#${pr.number}`}
            onClick={() => p.onOpenPr(pr.repo, pr.number)}
          >
            <span className="pr-link-l1">
              <PrIcon />
              <strong>
                {repoLabel(pr.repo)} #{pr.number}
              </strong>
              {pr.isDraft ? <span className="draft-pill">draft</span> : null}
            </span>
            <span className="mono muted small">{pr.headRef}</span>
            <span className="muted small">Closes #{d.summary.number} when merged</span>
          </button>
        ))}
      </Card>
      <Card title="Participants" count={d.participants.length}>
        <div className="people-wrap">
          {d.participants.map((a) => (
            <span className="person" key={a.login}>
              <Avatar login={a.login} url={a.avatarUrl} />
              {a.login}
            </span>
          ))}
        </div>
      </Card>
      <Card title="Repo" hint={<><KeyCap>O</KeyCap> open on GitHub</>}>
        <button type="button" className="link-btn plain" onClick={p.onOpenGithub}>
          {repoLabel(d.summary.repo)}
        </button>
      </Card>
    </>
  );
}

interface ActionsProps {
  disabled: boolean;
  closed: boolean;
  onComment: () => void;
  onEditTitle: () => void;
  onClose: (reason: 'COMPLETED' | 'NOT_PLANNED') => void;
  onReopen: () => void;
  onNew: () => void;
  /**
   * Absent hides the button (Orca not installed). `reason` disables it and shows as its title.
   * `pending` keeps the button in place, disabled, while Orca availability loads.
   */
  /** `live` names the issue when a session already works on it: the button goes dashed with a note. */
  dispatch?: { reason?: string; pending?: boolean; live?: number; onClick: () => void };
  /** Issues only. `held` is true when the issue already has the bot label. */
  bot?: { held: boolean; onClick: () => void };
  /** Which existing buttons take the primary style for the bot's verdict. */
  emphasis?: Emphasis;
}

interface EditLinkProps {
  disabled?: boolean;
  onClick: () => void;
  children?: string;
}

function EditLink({ disabled, onClick, children = 'Edit' }: EditLinkProps) {
  return (
    <button type="button" className="link-btn" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

interface EmptyLineProps {
  text: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
}

function EmptyLine({ text, action, disabled, onClick }: EmptyLineProps) {
  return (
    <section className="icard icard-empty">
      <div className="icard-empty-line">
        <span>{text}</span>
        <span aria-hidden="true">·</span>
        <EditLink disabled={disabled} onClick={onClick}>
          {action}
        </EditLink>
      </div>
    </section>
  );
}

/** Comfortable sidebar: borderless sections, empty ones collapsed to a single line. */
function FlatCards(p: CardsProps) {
  const d = p.detail;
  const me = assignMe(d.assignees, p.viewer);
  return (
    <>
      <StatusCard {...p} />
      <Card title="Assignees" hint={<EditLink disabled={p.disabled} onClick={p.onAssign} />}>
        {d.assignees.length === 0 ? <span className="muted">No one assigned</span> : null}
        {d.assignees.map((a) => (
          <div className="person-row" key={a.login}>
            <Avatar login={a.login} url={a.avatarUrl} size={20} />
            <span>{a.login}</span>
          </div>
        ))}
        <div className="assign-actions">
          <Btn keyHint="A" disabled={p.disabled || !me.enabled} onClick={p.onAssignMe}>
            {me.label}
          </Btn>
          <Btn keyHint="a" disabled={p.disabled} onClick={p.onAssign}>
            Choose…
          </Btn>
        </div>
      </Card>
      <Card title="Labels" hint={<EditLink disabled={p.disabled} onClick={p.onLabels} />}>
        <div className="chip-row">
          {d.summary.labels.length === 0 ? <span className="muted">No labels</span> : null}
          {d.summary.labels.map((l) => (
            <LabelChip key={l.name} label={l} />
          ))}
        </div>
      </Card>
      {d.milestone ? (
        <Card title="Milestone" hint={<EditLink disabled={p.disabled} onClick={p.onMilestone} />}>
          {d.milestone}
        </Card>
      ) : (
        <EmptyLine text="No milestone" action="Set" disabled={p.disabled} onClick={p.onMilestone} />
      )}
      {d.linkedPrs.length === 0 ? (
        <EmptyLine text="No linked PRs" action="Link" disabled={p.disabled} onClick={p.onOpenGithub} />
      ) : (
        <Card title="Linked PRs" count={d.linkedPrs.length}>
          {d.linkedPrs.map((pr) => (
            <button
              type="button"
              className="pr-link"
              key={`${pr.repo}#${pr.number}`}
              onClick={() => p.onOpenPr(pr.repo, pr.number)}
            >
              <span className="pr-link-l1">
                <PrIcon />
                <strong>
                  {repoLabel(pr.repo)} #{pr.number}
                </strong>
                {pr.isDraft ? <span className="draft-pill">draft</span> : null}
              </span>
              <span className="mono muted small">{pr.headRef}</span>
              <span className="muted small">Closes #{d.summary.number} when merged</span>
            </button>
          ))}
        </Card>
      )}
      <Card title="Participants">
        <div className="people-wrap people-stack">
          <span className="avatar-stack">
            {d.participants.map((a) => (
              <Avatar key={a.login} login={a.login} url={a.avatarUrl} size={20} />
            ))}
          </span>
          <span>{d.participants.map((a) => a.login).join(', ')}</span>
        </div>
      </Card>
      <Card title="Repo" hint={<EditLink onClick={p.onOpenGithub}>Open on GitHub</EditLink>}>
        {repoLabel(d.summary.repo)}
      </Card>
    </>
  );
}

function DispatchButton(p: ActionsProps) {
  const b = bot();
  const handTo = b.enabled ? p.bot : undefined;
  if (!p.dispatch && !handTo) return null;
  const reason = p.dispatch?.reason;
  const live = p.dispatch?.live;
  const held = handTo?.held;
  return (
    <div className="actions-row actions-dispatch">
      {p.dispatch ? (
        <Btn
          keyHint="D"
          className={live === undefined ? undefined : 'dispatch-live'}
          disabled={p.disabled || p.closed || !!reason || p.dispatch.pending}
          title={reason}
          aria-describedby={live === undefined ? undefined : 'dispatch-live'}
          onClick={p.dispatch.onClick}
        >
          Dispatch with Orca
        </Btn>
      ) : null}
      {handTo ? (
        <Btn
          primary={p.emphasis?.hand}
          keyHint={held ? undefined : 'L'}
          disabled={p.disabled || p.closed || held}
          title={held ? botHeld(b) : undefined}
          aria-describedby={held ? 'bot-held' : undefined}
          onClick={handTo.onClick}
        >
          {held ? `With ${b.name}` : `Hand to ${b.name}`}
        </Btn>
      ) : null}
      {held ? (
        <span id="bot-held" className="muted small actions-caption">
          {botHeld(b)}
        </span>
      ) : null}
      {live === undefined ? null : (
        <span id="dispatch-live" className="muted small actions-caption">
          {`A live Orca session already works on #${live}.`}
        </span>
      )}
    </div>
  );
}

/** Pinned panel at the bottom of the sidebar. */
export function ActionsPanel(p: ActionsProps) {
  if (useDensityValue() === 'comfortable') {
    return (
      <div className="actions-panel">
        <div className="actions-grid">
          <div className="actions-row">
            {p.closed ? (
              <Btn keyHint="o" disabled={p.disabled} onClick={p.onReopen}>
                Reopen
              </Btn>
            ) : (
              <>
                <Btn primary={p.emphasis?.close} keyHint="x" disabled={p.disabled} onClick={() => p.onClose('COMPLETED')}>
                  Close as completed
                </Btn>
                <Btn primary={p.emphasis?.notPlanned} keyHint="X" disabled={p.disabled} onClick={() => p.onClose('NOT_PLANNED')}>
                  Not planned
                </Btn>
              </>
            )}
          </div>
          <div className="actions-row">
            <Btn keyHint="e" disabled={p.disabled} onClick={p.onEditTitle}>
              Edit title
            </Btn>
            <Btn keyHint="n" disabled={p.disabled} onClick={p.onNew}>
              + New issue
            </Btn>
          </div>
          <DispatchButton {...p} />
        </div>
      </div>
    );
  }
  return (
    <div className="actions-panel">
      <div className="actions-label">ACTIONS</div>
      <div className="actions-grid">
        <Btn primary keyHint="c" disabled={p.disabled} onClick={p.onComment}>
          Comment
        </Btn>
        <Btn keyHint="e" disabled={p.disabled} onClick={p.onEditTitle}>
          Edit title
        </Btn>
        {p.closed ? null : (
          <>
            <Btn primary={p.emphasis?.close} keyHint="x" disabled={p.disabled} onClick={() => p.onClose('COMPLETED')}>
              Close as completed
            </Btn>
            <Btn primary={p.emphasis?.notPlanned} keyHint="X" disabled={p.disabled} onClick={() => p.onClose('NOT_PLANNED')}>
              Not planned
            </Btn>
          </>
        )}
        <Btn className={p.closed ? 'actions-reopen' : undefined} keyHint="o" disabled={p.disabled || !p.closed} onClick={p.onReopen}>
          Reopen
        </Btn>
        {p.closed ? null : <span className="muted small actions-note">disabled while open</span>}
        <Btn className="actions-new" keyHint="n" disabled={p.disabled} onClick={p.onNew}>
          + New issue
        </Btn>
        <DispatchButton {...p} />
      </div>
    </div>
  );
}
