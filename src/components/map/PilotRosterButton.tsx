'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePresenceForMap } from '@/components/map/MapPresenceContext';
import { PilotRoster } from '@/components/map/PilotRoster';
import type { MapSystemNode, MapViewData } from '@/types';

/**
 * Toolbar control that surfaces the online-pilot roster in a non-blocking
 * popover. The roster tracks realtime `characterUpdate` movement (via the
 * presence store) while open, and the popover leaves the map underneath
 * interactive. Must render inside `MapPresenceProvider`.
 */
export function PilotRosterButton({ viewData }: { viewData: MapViewData }) {
  const presence = usePresenceForMap();
  // EVE solar-system id → placed map node, for the roster's map-specific tag.
  const systemNameById = useMemo(() => {
    const m = new Map<number, MapSystemNode>();
    for (const s of viewData.systems) m.set(s.systemId, s);
    return m;
  }, [viewData.systems]);

  return (
    <Popover
      onOpenChange={(_open, details) => {
        // Outside clicks must not dismiss the roster — it stays open until the
        // button is pressed again, so pilots stay visible while working the map.
        if (details.reason === 'outside-press') details.cancel();
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm">
            <Users />
            Pilots ({presence.length})
          </Button>
        }
      />
      <PopoverContent className="w-[28rem] p-0">
        <PilotRoster presence={presence} systemNameById={systemNameById} />
      </PopoverContent>
    </Popover>
  );
}
