'use client';

import type { ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Tooltip } from '@base-ui/react/tooltip';
import { Clock, Home, Lock, Signal, Users } from 'lucide-react';
import type { MapSystemNode } from '@/lib/map/loadMap';
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import { homeAccentColor, systemClassColor, systemStatusColor } from './styling';
import { InlineTextEdit } from './InlineTextEdit';
import { usePresenceForSystem } from './MapPresenceContext';
import { useSignatureIndicator } from './MapSignatureIndicatorContext';
import { useUnderglowForSystem } from './MapUnderglowContext';
import { SystemUnderglow } from './SystemUnderglow';

// System tile. Status stripe + security badge + tag + alias/name + presence
// badge + lock + a J-space statics line. Alias and tag are inline
// double-click-to-edit; all other edits (status, intel, rally, locked) live in
// the sidebar inspector. The presence badge shows the count of online tracked
// pilots currently in this system, with a hover panel listing each pilot and
// their ship (legacy Pathfinder parity).

export type SystemNodeData = MapSystemNode & {
  /** Wired by `MapCanvas`; absent on the (now legacy) read-only path. */
  onAliasOrTagCommit?: (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => void;
  /** Derived in `MapCanvas` from the map's `homeMapSystemId`; marks this tile as the Home system. */
  isHome?: boolean;
};

function securityLabel(node: MapSystemNode): string {
  if (node.security) return node.security;
  if (node.trueSec != null) return node.trueSec.toFixed(1);
  return '?';
}

export function SystemNode({ data, selected }: NodeProps & { data: SystemNodeData }) {
  const color = systemStatusColor(data.status);
  const isWormhole = data.statics.length > 0 || /^J\d{6}$/.test(data.name);
  const onAliasOrTagCommit = data.onAliasOrTagCommit;
  const pilots = usePresenceForSystem(data.systemId);
  const glow = useUnderglowForSystem(data.id);
  const sigIndicator = useSignatureIndicator(data.id, isWormhole);

  // Compose the box-shadow from the Home accent ring (inner) and the selection
  // halo, so a selected Home tile shows both. Empty → undefined so the Tailwind
  // `ring-1` shows as the resting state.
  const home = homeAccentColor();
  const boxShadow = [
    data.isHome ? `0 0 0 2px ${home}` : '',
    selected ? `0 0 0 4px ${color}40, 0 0 16px 3px ${color}cc` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className="relative min-w-36 cursor-pointer rounded-md bg-card text-xs text-card-foreground shadow-sm ring-1 transition-[box-shadow,outline,transform] duration-50"
      style={{
        borderLeft: `4px solid ${color}`,
        // Selected tiles get a prominent halo in their status colour: a solid
        // offset ring plus a soft outer glow, so selection reads at a glance
        // regardless of the (often muted) status stripe. `${color}NN` appends an
        // 8-digit-hex alpha to the status hex.
        outline: selected ? `2px solid ${color}` : 'none',
        outlineOffset: selected ? '3px' : undefined,
        boxShadow: boxShadow || undefined,
        transform: selected ? 'scale(1.01)' : undefined,
      }}
      title={`${data.regionName} › ${data.constellationName}`}
    >
      {glow && <SystemUnderglow key={glow.token} {...glow.config} />}
      <SignatureIndicators
        stale={sigIndicator.stale}
        ageMs={sigIndicator.ageMs}
        unscanned={sigIndicator.unscanned}
      />
      <Handle type="source" position={Position.Top} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0.2 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0.2 }} />

      <div className="flex items-center px-2 py-1">
        <span
          className="rounded bg-muted px-0.5 font-mono text-[10px] leading-tight"
          style={{ color: systemClassColor(data.security) }}
        >
          {securityLabel(data)}
        </span>
        {onAliasOrTagCommit ? (
          <InlineTextEdit
            value={data.tag}
            placeholder=""
            ariaLabel="Tag"
            maxLength={50}
            onCommit={(next) => onAliasOrTagCommit(data.id, 'tag', next)}
            className="rounded bg-primary/15 px-0.5 text-[10px] font-mono leading-tight empty:hidden"
            inputClassName="w-12"
          />
        ) : (
          data.tag && (
            <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
              {data.tag}
            </span>
          )
        )}
        {onAliasOrTagCommit ? (
          <InlineTextEdit
            value={data.alias}
            placeholder={data.name}
            ariaLabel="Alias"
            maxLength={100}
            onCommit={(next) => onAliasOrTagCommit(data.id, 'alias', next)}
            className="flex-1 truncate font-medium pl-1"
            inputClassName="w-full"
          />
        ) : (
          <span className="flex-1 truncate font-medium">{data.alias ?? data.name}</span>
        )}
        {pilots.length > 0 && <PresenceBadge pilots={pilots} />}
        {data.isHome && (
          <Home className="size-3" style={{ color: home }} aria-label="Home system" />
        )}
        {data.locked && <Lock className="size-3 text-muted-foreground" />}
      </div>

      <div className="flex items-center gap-1 border-t border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground">
        {isWormhole ? (
          <>
            {data.effect && <span className="capitalize">{data.effect}</span>}
            {data.statics.length > 0 && (
              <span className="flex items-center gap-1">
                {data.statics.map((cls, i) => (
                  <span key={i} className="font-bold" style={{ color: systemClassColor(cls) }}>{cls}</span>
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="truncate">{data.regionName}</span>
        )}
      </div>
    </div>
  );
}

/** "3h ago" → "3h" for the compact badge; sub-minute reads empty. */
function compactAge(ms: number): string {
  const label = formatAgoFromMs(ms);
  return label === 'just now' ? '' : label.replace(' ago', '');
}

/**
 * Stale (clock) and unscanned (signal) indicators, floating just off the
 * top-right corner of the tile. `pointer-events-none` so they never swallow a
 * node click; `nodrag nopan` keeps xyflow from panning if one is grabbed.
 */
function SignatureIndicators({
  stale,
  ageMs,
  unscanned,
}: {
  stale: boolean;
  ageMs: number | null;
  unscanned: number;
}) {
  if (!stale && unscanned === 0) return null;
  return (
    // `pointer-events-none` on the wrapper keeps the gaps between pills from
    // swallowing node clicks; each pill re-enables pointer events so its
    // tooltip can open on hover/focus.
    <div className="nodrag nopan pointer-events-none absolute -top-2 -right-2 flex items-center gap-1">
      {stale && (
        <IndicatorPill
          className="text-amber-400 ring-amber-400/40"
          label={
            ageMs != null
              ? `Signatures last updated ${formatAgoFromMs(ageMs)}`
              : 'No signatures scanned'
          }
        >
          <Clock className="size-2.5" aria-hidden />
          {ageMs != null && compactAge(ageMs)}
        </IndicatorPill>
      )}
      {unscanned > 0 && (
        <IndicatorPill
          className="text-sky-400 ring-sky-400/40"
          label={`${unscanned} unscanned signature${unscanned === 1 ? '' : 's'}`}
        >
          <Signal className="size-2.5" aria-hidden />
          {unscanned}
        </IndicatorPill>
      )}
    </div>
  );
}

/**
 * One signature-indicator pill with a hover/focus tooltip explaining what it
 * means. `pointer-events-auto` overrides the wrapper so the tooltip can open;
 * `nodrag nopan` keeps the interaction from panning the canvas.
 */
function IndicatorPill({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<span />}
        className={`nodrag nopan pointer-events-auto inline-flex items-center gap-0.5 rounded-full bg-card px-1 py-0.5 text-[9px] font-semibold leading-none shadow-sm ring-1 ${className}`}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={4} side="top" align="center">
          <Tooltip.Popup className="nodrag nopan z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function PresenceBadge({
  pilots,
}: {
  pilots: readonly import('@/lib/map/loadMap').MapPresenceEntry[];
}) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        // `nodrag nopan` so opening the hover panel doesn't trigger xyflow's
        // pan/drag — same pattern as InlineTextEdit. Render as a button so
        // it's keyboard-focusable; default `<a>` would suggest a navigation.
        render={<button type="button" />}
        className="nodrag nopan inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-tight text-primary-foreground"
        aria-label={`${pilots.length} pilot${pilots.length === 1 ? '' : 's'} in system`}
      >
        <Users className="size-2.5" aria-hidden />
        {pilots.length}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={4} side="top" align="end">
          <PreviewCard.Popup className="nodrag nopan z-50 min-w-40 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
            <ul className="space-y-0.5">
              {pilots.map((p) => (
                <li key={p.characterId} className="flex items-start justify-between gap-3">
                  <span className="font-medium">{p.characterName}</span>
                  <span className="flex flex-col items-end text-right text-muted-foreground">
                    <span>{p.shipName ?? p.shipTypeName ?? '—'}</span>
                    {/* Custom ship name and type both shown; the type line is
                        omitted when the pilot never renamed the hull (ESI
                        defaults ship_name to the type name). */}
                    {p.shipName && p.shipTypeName && p.shipName !== p.shipTypeName && (
                      <span className="text-[10px] text-muted-foreground/70">{p.shipTypeName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
