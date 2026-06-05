'use client';

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
 * The online-pilot roster table — pilot / location (class-coloured label +
 * system + map tag) / ship. Presentational: presence comes from the caller, and
 * the tag is resolved against the map's placed nodes.
 */
export function PilotRoster({
  presence,
  systemNameById,
}: {
  presence: readonly MapPresenceEntry[];
  systemNameById: Map<number, MapSystemNode>;
}) {
  if (presence.length === 0) return <EmptyRow>No tracked pilots are online.</EmptyRow>;

  return (
    <ScrollTable>
      <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase text-muted-foreground">
        <tr>
          <Th>Pilot</Th>
          <Th>Location</Th>
          <Th>Ship</Th>
        </tr>
      </thead>
      <tbody>
        {presence.map((p) => {
          // Name + class ride the presence entry (resolved server-side, so they
          // work even when the pilot's system isn't placed on the map). The tag
          // is map-specific, so it comes from the placed node when there is one.
          const tag = systemNameById.get(p.systemId)?.tag ?? null;
          return (
            <tr key={p.characterId} className="border-t border-foreground/10">
              <Td>{p.characterName}</Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <span
                    className="font-mono font-bold"
                    style={{ color: systemClassColor(p.systemSecurity) }}
                  >
                    {classLabel(p.systemSecurity, p.systemTrueSec)}
                  </span>
                  <span>{p.systemName ?? p.systemId}</span>
                  {tag && (
                    <span className="rounded bg-primary/15 px-1 font-mono font-bold text-primary">
                      {tag}
                    </span>
                  )}
                </span>
              </Td>
              <Td className="text-muted-foreground">
                {p.shipName ?? p.shipTypeName ?? '—'}
                {/* Custom hull name and type both shown; the type line is omitted
                    when the pilot never renamed the hull (ESI defaults ship_name
                    to the type name). */}
                {p.shipName && p.shipTypeName && p.shipName !== p.shipTypeName && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                    {p.shipTypeName}
                  </span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </ScrollTable>
  );
}
