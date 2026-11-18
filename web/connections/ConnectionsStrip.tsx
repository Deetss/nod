import type { LinkState, Strip, StripNode } from './model';

function Node({ node, slot }: { node: StripNode; slot: string }) {
  return (
    <div className={`cx-node cx-node-${slot} is-${node.state}`}>
      <span className="cx-node-name">{node.name}</span>
      <span className="cx-node-detail" title={node.detail}>
        {node.detail}
      </span>
    </div>
  );
}

function Link({ state, slot }: { state: LinkState; slot: string }) {
  return <span className={`cx-link cx-link-${slot} is-${state}`} aria-hidden="true" />;
}

const LINK_WORDS: Record<LinkState, string> = { ok: 'working', off: 'off', broken: 'broken' };

/** GitHub, This Nod, Tailscale and Devices on one line, Orca under This Nod. Read by screen readers as one sentence. */
export function ConnectionsStrip({ strip }: { strip: Strip }) {
  const { links } = strip;
  const summary =
    `GitHub link ${LINK_WORDS[links.github]}, Tailscale link ${LINK_WORDS[links.tailscale]}, ` +
    `devices link ${LINK_WORDS[links.devices]}, Orca link ${LINK_WORDS[links.orca]}.`;
  return (
    <div className="cx-strip" role="img" aria-label={summary}>
      <Link state={links.github} slot="github" />
      <Link state={links.tailscale} slot="tailscale" />
      <Link state={links.devices} slot="devices" />
      <Link state={links.orca} slot="orca" />
      <Node node={strip.github} slot="github" />
      <Node node={strip.nod} slot="nod" />
      <Node node={strip.tailscale} slot="tailscale" />
      <Node node={strip.devices} slot="devices" />
      <Node node={strip.orca} slot="orca" />
    </div>
  );
}
