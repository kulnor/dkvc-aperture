'use client';

import { Unplug } from 'lucide-react';
import { EmptyRow, ScrollTable, Td, Th } from '@/components/dialogs/infoTable';
import { systemClassColor } from '@/components/map/styling';
import type { MapPresenceEntry, MapSystemNode } from '@/types';

/** System class label: the `C<n>`/sec rating, falling back to trueSec then `?`. */
function classLabel(security: string | null, trueSec: number | null): string {
  if (security) return security;
  if (trueSec != null) return trueSec.toFixed(1);
  return '?';
}

/**
 * The online-pilot roster table — pilot / location (class-coloured class label +
 * map tag + system) / ship type / custom ship name. Presentational: presence
 * comes from the caller, and the tag is resolved against the map's placed nodes.
 */
export function PilotRoster({
  presence,
  systemNameById,
  viewerIds,
}: {
  presence: readonly MapPresenceEntry[];
  systemNameById: Map<number, MapSystemNode>;
  /** Character ids whose account currently has this map open in a live socket. */
  viewerIds: ReadonlySet<number>;
}) {
  if (presence.length === 0) return <EmptyRow>No tracked pilots are online.</EmptyRow>;

  return (
    <ScrollTable>
      <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase text-muted-foreground">
        <tr>
          <Th>Pilot</Th>
          <Th>Location</Th>
          <Th>Type</Th>
          <Th>Ship</Th>
        </tr>
      </thead>
      <tbody>
        {presence.map((p) => {
          // Name + class ride the presence entry (resolved server-side, so they
          // work even when the pilot's system isn't placed on the map). The tag
          // is map-specific, so it comes from the placed node when there is one.
          const tag = systemNameById.get(p.systemId)?.tag ?? null;
          // Online (in-game) is what put the pilot on this roster; the icon flags
          // the ones who don't also have the map open in Aperture right now.
          const mapOpen = viewerIds.has(p.characterId);
          return (
            <tr key={p.characterId} className="border-t border-foreground/10">
              <Td>
                <span className="flex items-center gap-1.5">
                  <span>{p.characterName}</span>
                  {!mapOpen && (
                    <span title="Online in-game, but doesn't have this map open in Aperture">
                      <Unplug className="size-3.5 text-amber-500" aria-hidden />
                    </span>
                  )}
                </span>
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <span
                    className="font-mono font-bold"
                    style={{ color: systemClassColor(p.systemSecurity) }}
                  >
                    {classLabel(p.systemSecurity, p.systemTrueSec)}
                  </span>
                  {tag && (
                    <span
                      className="font-mono font-bold"
                      style={{ color: systemClassColor(p.systemSecurity) }}
                    >
                      {tag}
                    </span>
                  )}
                  <span>{p.systemName ?? p.systemId}</span>
                </span>
              </Td>
              <Td className="text-muted-foreground">{p.shipTypeName ?? '—'}</Td>
              <Td className="text-muted-foreground">
                {/* Only the custom hull name; ESI defaults ship_name to the type
                    name, so an un-renamed hull reads as no custom name. */}
                {p.shipName && p.shipName !== p.shipTypeName ? p.shipName : '—'}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </ScrollTable>
  );
}
