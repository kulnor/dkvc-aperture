'use client';

import { Navigation } from 'lucide-react';
import { toast } from 'sonner';

import type { MapSystemNode } from '@/types';
import { setWaypointOnServer } from '@/lib/character/client';
import { useMapActiveChar } from './MapActiveCharContext';
import {
  MenuItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuSubmenuContent,
  MenuSeparator,
} from '@/components/ui/menu';
import { cn } from '@/lib/utils';

const systemLabel = (s: MapSystemNode) => s.alias?.trim() || s.name;

/**
 * Fires the appropriate toast after a "All characters" fan-out resolves.
 * Exported for unit testing.
 */
export function applyWaypointFanOutResult(successes: number, total: number): void {
  if (successes === 0) {
    toast.error('Failed to set destination for any character');
  } else if (successes === total) {
    toast.success(`Destination set for all ${total} characters`);
  } else {
    toast.success(`Destination set for ${successes} of ${total} characters`);
  }
}

/**
 * "Set destination" context menu item.
 *
 * - 0 located chars: disabled item
 * - 1 located char: direct action — no submenu
 * - 2+ located chars: submenu with per-character entries + "All characters" fan-out
 */
export function SetDestinationItem({
  system,
  onClose,
}: {
  system: MapSystemNode;
  onClose: () => void;
}) {
  const { activeCharId, locatedChars } = useMapActiveChar();

  if (locatedChars.length === 0) {
    return (
      <MenuItem icon={<Navigation className="size-3.5" />} disabled>
        Set destination
      </MenuItem>
    );
  }

  if (locatedChars.length === 1) {
    const char = locatedChars[0]!;
    return (
      <MenuItem
        icon={<Navigation className="size-3.5" />}
        onClick={() => {
          void setWaypointOnServer({
            characterId: char.id,
            destinationId: system.systemId,
          }).then((result) => {
            if (result.ok) toast.success(`Waypoint set to ${systemLabel(system)}`);
          });
          onClose();
        }}
      >
        Set destination
      </MenuItem>
    );
  }

  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger icon={<Navigation className="size-3.5" />}>
        Set destination
      </MenuSubmenuTrigger>
      <MenuSubmenuContent>
        <MenuItem
          onClick={() => {
            const total = locatedChars.length;
            void Promise.allSettled(
              locatedChars.map((c) =>
                setWaypointOnServer({ characterId: c.id, destinationId: system.systemId }),
              ),
            ).then((results) => {
              const successes = results.filter(
                (r) => r.status === 'fulfilled' && r.value.ok,
              ).length;
              applyWaypointFanOutResult(successes, total);
            });
            onClose();
          }}
        >
          All characters
        </MenuItem>
        <MenuSeparator />
        {locatedChars.map((char) => (
          <MenuItem
            key={char.id}
            className={cn(char.id === activeCharId && 'font-bold')}
            onClick={() => {
              void setWaypointOnServer({
                characterId: char.id,
                destinationId: system.systemId,
              }).then((result) => {
                if (result.ok) toast.success(`Waypoint set to ${systemLabel(system)}`);
              });
              onClose();
            }}
          >
            {char.name}
          </MenuItem>
        ))}
      </MenuSubmenuContent>
    </MenuSubmenu>
  );
}
