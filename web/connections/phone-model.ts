import type { ConnectionsBody } from '../../shared/connections';
import {
  ageText,
  CHECKING,
  deviceRow,
  githubRow,
  orcaRow,
  tailscaleRow,
  versionText,
  type ConnRow,
  type Ctx,
  type LinkState,
} from './model';

export interface PhoneRail {
  subtitle: string;
  /** The path the phone uses: This phone, Tailscale, Hub, GitHub, Orca on the hub. */
  rail: ConnRow[];
  /** `links[i]` joins `rail[i]` and `rail[i + 1]`. */
  links: LinkState[];
  others: ConnRow[];
}

const NAMES = ['This phone', 'Tailscale', 'Hub', 'GitHub', 'Orca on the hub'];

/** A link is broken next to a broken row, off next to an idle one, and working otherwise. */
export function linkBetween(a: ConnRow, b: ConnRow): LinkState {
  if (a.mark === 'broken' || b.mark === 'broken') return 'broken';
  if ([a.mark, b.mark].some((m) => m === 'off' || m === 'checking')) return 'off';
  return 'ok';
}

const linksOf = (rail: ConnRow[]) => rail.slice(1).map((row, i) => linkBetween(rail[i]!, row));

export function phoneRail(b: ConnectionsBody | undefined, ctx: Ctx): PhoneRail {
  if (!b) {
    const rail = NAMES.map((name, i): ConnRow => ({ key: `rail-${i}`, name, mark: 'checking', detail: CHECKING }));
    return { subtitle: CHECKING, rail, links: linksOf(rail), others: [] };
  }
  const self = b.devices.find((d) => d.self);
  const phone: ConnRow = self
    ? { key: 'self', name: 'This phone', mark: self.push ? 'ok' : 'off', detail: `${self.name}. Push ${self.push ? 'on' : 'off'}.` }
    : { key: 'self', name: 'This phone', mark: 'off', detail: 'Not a paired device.' };
  const synced = b.github.syncedAt > 0 ? `Synced ${ageText(b.github.syncedAt, ctx.now)}.` : 'Not synced yet.';
  const hub: ConnRow = {
    key: 'hub',
    name: 'Hub',
    mark: 'hub',
    detail: `${b.nod.mode === 'service' ? 'Nod service' : 'Own server'}, ${versionText(b.nod.build)}. ${synced}`,
  };
  const gh = githubRow(b);
  const r = b.github.rate;
  const api = r ? ` API ${r.remaining.toLocaleString('en-US')} / ${r.limit.toLocaleString('en-US')}.` : '';
  const github: ConnRow = gh.mark === 'ok' ? { ...gh, detail: `${b.github.login ?? 'Logged in'}.${api}`, action: undefined } : { ...gh, action: undefined };
  const rail = [phone, tailscaleRow(b), hub, github, orcaRow(b, 'hub')];
  const reached = b.tailscale.on && b.tailscale.serve === 'served';
  return {
    subtitle: reached ? 'This phone reaches the hub over Tailscale.' : 'The hub is not served over Tailscale.',
    rail,
    links: linksOf(rail),
    // No rename on the phone, so the rows carry no device id.
    others: b.devices.filter((d) => !d.self).map(({ id: _id, ...d }) => deviceRow(d, ctx)),
  };
}
