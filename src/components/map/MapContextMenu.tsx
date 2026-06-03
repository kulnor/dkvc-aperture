'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Plus, Scissors, Trash2 } from 'lucide-react';

import type { MapContextMenuTarget, MapSystemNode, MapConnectionEdge } from '@/types';
import type { UpdateSystemBody, UpdateConnectionBody } from '@/lib/map/client';
import { neighborsOf } from '@/lib/map/subchainGraph';
import {
  MenuItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuSubmenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
  MenuSeparator,
} from '@/components/ui/menu';
import {
  SYSTEM_STATUSES,
  WH_MASSES,
  WH_JUMP_MASSES,
  CONNECTION_SCOPES,
  EOL_STAGES,
  EOL_STAGE_LABELS,
  type SystemStatus,
  type WhMass,
  type WhJumpMass,
  type ConnectionScope,
  type EolStage,
} from '@/lib/map/enumLabels';
import { cn } from '@/lib/utils';

/** Sentinel radio value for "jump mass unknown" — mirrors `InspectorModule.tsx`. */
const NONE_JUMP_MASS = '__none__';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Human label for a system in menus: its alias when set, else the solar-system name. */
const systemLabel = (s: MapSystemNode) => s.alias?.trim() || s.name;

/**
 * Controlled, cursor-anchored context menu for the map canvas. Driven entirely
 * by `target`: when non-null the menu opens, anchored to the stored client x/y
 * via a virtual anchor element. Real per-kind items are built in `renderItems`,
 * resolving the target row from `systems`/`connections`; every leaf action calls
 * its callback and then `onClose()`. No text-input actions live here — those
 * stay in the inspector sidebar.
 */
export function MapContextMenu({
  target,
  onClose,
  systems,
  connections,
  homeMapSystemId,
  onSystemPatch,
  onSystemRemove,
  onConnectionPatch,
  onConnectionDelete,
  onAddSystemAt,
  onDeleteSubchain,
  onDeleteSubchainPick,
}: {
  target: MapContextMenuTarget | null;
  onClose: () => void;
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
  /** `ap_map_system.id` of the designated Home, or null. Drives the subchain anchor. */
  homeMapSystemId: string | null;
  onSystemPatch: (id: string, patch: UpdateSystemBody) => void;
  onSystemRemove: (id: string) => void;
  onConnectionPatch: (id: string, patch: UpdateConnectionBody) => void;
  onConnectionDelete: (id: string) => void;
  onAddSystemAt: (clientX: number, clientY: number) => void;
  /** Home-anchored: delete this head system + its branch (Home is the keep-side). */
  onDeleteSubchain: (headId: string) => void;
  /** No-Home fallback: delete this head, keeping the chosen neighbour's side. */
  onDeleteSubchainPick: (headId: string, anchorId: string) => void;
}) {
  // A zero-size virtual element at the cursor point; recreated per render so the
  // rect tracks the current target's coordinates.
  const anchor = target
    ? {
        getBoundingClientRect: () =>
          ({
            x: target.x,
            y: target.y,
            width: 0,
            height: 0,
            top: target.y,
            left: target.x,
            right: target.x,
            bottom: target.y,
          }) as DOMRect,
      }
    : null;

  return (
    // `ContextMenu.Root` (not raw `Menu.Root`) so the menu runs in Base UI's
    // context-menu mode: it sets `parent.type === 'context-menu'`, which gates
    // the open/dismiss lifecycle (outside-press grace period, `allowMouseEnter`
    // for submenu hover). A raw `Menu.Root` stays in dropdown mode and tears
    // itself down the instant submenu hover machinery engages — which is why the
    // submenu-bearing system/connection menus collapsed on pointer move while the
    // submenu-free pane menu survived. We still drive `open` + positioning
    // ourselves via the virtual anchor; the right-click target lives in `target`.
    <ContextMenu.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          anchor={anchor}
          side="right"
          align="start"
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup
            data-slot="map-context-menu"
            className={cn(
              'min-w-40 overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            {renderItems({
              target,
              onClose,
              systems,
              connections,
              homeMapSystemId,
              onSystemPatch,
              onSystemRemove,
              onConnectionPatch,
              onConnectionDelete,
              onAddSystemAt,
              onDeleteSubchain,
              onDeleteSubchainPick,
            })}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </ContextMenu.Root>
  );
}

function renderItems({
  target,
  onClose,
  systems,
  connections,
  homeMapSystemId,
  onSystemPatch,
  onSystemRemove,
  onConnectionPatch,
  onConnectionDelete,
  onAddSystemAt,
  onDeleteSubchain,
  onDeleteSubchainPick,
}: {
  target: MapContextMenuTarget | null;
  onClose: () => void;
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
  homeMapSystemId: string | null;
  onSystemPatch: (id: string, patch: UpdateSystemBody) => void;
  onSystemRemove: (id: string) => void;
  onConnectionPatch: (id: string, patch: UpdateConnectionBody) => void;
  onConnectionDelete: (id: string) => void;
  onAddSystemAt: (clientX: number, clientY: number) => void;
  onDeleteSubchain: (headId: string) => void;
  onDeleteSubchainPick: (headId: string, anchorId: string) => void;
}) {
  if (!target) return null;

  switch (target.kind) {
    case 'system': {
      const system = systems.find((s) => s.id === target.id);
      if (!system) return <MenuItem disabled>System not found</MenuItem>;
      return (
        <SystemItems
          system={system}
          systems={systems}
          connections={connections}
          isHome={homeMapSystemId === system.id}
          hasHome={homeMapSystemId !== null}
          onPatch={(patch) => {
            onSystemPatch(system.id, patch);
            onClose();
          }}
          onRemove={() => {
            onSystemRemove(system.id);
            onClose();
          }}
          onDeleteSubchain={() => {
            onDeleteSubchain(system.id);
            onClose();
          }}
          onDeleteSubchainPick={(anchorId) => {
            onDeleteSubchainPick(system.id, anchorId);
            onClose();
          }}
        />
      );
    }
    case 'connection': {
      const connection = connections.find((c) => c.id === target.id);
      if (!connection) return <MenuItem disabled>Connection not found</MenuItem>;
      return (
        <ConnectionItems
          connection={connection}
          onPatch={(patch) => {
            onConnectionPatch(connection.id, patch);
            onClose();
          }}
          onDelete={() => {
            onConnectionDelete(connection.id);
            onClose();
          }}
        />
      );
    }
    case 'pane':
      return (
        <MenuItem
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            onAddSystemAt(target.x, target.y);
            onClose();
          }}
        >
          Add system
        </MenuItem>
      );
  }
}

function SystemItems({
  system,
  systems,
  connections,
  isHome,
  hasHome,
  onPatch,
  onRemove,
  onDeleteSubchain,
  onDeleteSubchainPick,
}: {
  system: MapSystemNode;
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
  /** This system is the map's designated Home (can't be a subchain head). */
  isHome: boolean;
  /** The map has a designated Home (drives single-click vs keep-side fallback). */
  hasHome: boolean;
  onPatch: (patch: UpdateSystemBody) => void;
  onRemove: () => void;
  onDeleteSubchain: () => void;
  onDeleteSubchainPick: (anchorId: string) => void;
}) {
  return (
    <>
      <MenuSubmenu>
        <MenuSubmenuTrigger inset>Status</MenuSubmenuTrigger>
        <MenuSubmenuContent>
          <MenuRadioGroup
            value={system.status}
            onValueChange={(v) => onPatch({ status: v as SystemStatus })}
          >
            {SYSTEM_STATUSES.map((s) => (
              <MenuRadioItem key={s} value={s}>
                {capitalize(s)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubmenuContent>
      </MenuSubmenu>

      <MenuItem
        inset
        onClick={() =>
          onPatch({ rallyAt: system.rallyAt ? null : new Date().toISOString() })
        }
      >
        {system.rallyAt ? 'Clear rally' : 'Set rally'}
      </MenuItem>

      <MenuCheckboxItem
        checked={system.locked}
        onCheckedChange={(checked) => onPatch({ locked: checked })}
      >
        Locked
      </MenuCheckboxItem>

      <MenuSeparator />

      <MenuItem
        className="text-destructive data-highlighted:text-destructive"
        icon={<Trash2 className="size-3.5" />}
        onClick={onRemove}
      >
        Remove from map
      </MenuItem>

      {/* Delete subchain: hidden for the Home node (it can't be a head). With a
          Home set it's a single click (Home is the keep-side); otherwise the
          user picks which neighbour to keep. */}
      {!isHome &&
        (hasHome ? (
          <MenuItem
            className="text-destructive data-highlighted:text-destructive"
            icon={<Scissors className="size-3.5" />}
            onClick={onDeleteSubchain}
          >
            Delete subchain
          </MenuItem>
        ) : (
          <SubchainKeepSubmenu
            system={system}
            systems={systems}
            connections={connections}
            onPick={onDeleteSubchainPick}
          />
        ))}
    </>
  );
}

/**
 * No-Home fallback: a submenu listing the head's neighbours so the user picks
 * which side to KEEP. That neighbour becomes the anchor; the head and the rest
 * of its branch are deleted. Disabled when the head has no connections.
 */
function SubchainKeepSubmenu({
  system,
  systems,
  connections,
  onPick,
}: {
  system: MapSystemNode;
  systems: MapSystemNode[];
  connections: MapConnectionEdge[];
  onPick: (anchorId: string) => void;
}) {
  const neighbourIds = neighborsOf(connections, system.id);
  if (neighbourIds.length === 0) {
    return (
      <MenuItem inset disabled>
        Delete subchain
      </MenuItem>
    );
  }
  const byId = new Map(systems.map((s) => [s.id, s]));
  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger inset>Delete subchain</MenuSubmenuTrigger>
      <MenuSubmenuContent>
        {neighbourIds.map((id) => {
          const neighbour = byId.get(id);
          return (
            <MenuItem key={id} onClick={() => onPick(id)}>
              Keep {neighbour ? systemLabel(neighbour) : id}
            </MenuItem>
          );
        })}
      </MenuSubmenuContent>
    </MenuSubmenu>
  );
}

function ConnectionItems({
  connection,
  onPatch,
  onDelete,
}: {
  connection: MapConnectionEdge;
  onPatch: (patch: UpdateConnectionBody) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <MenuSubmenu>
        <MenuSubmenuTrigger inset>Mass</MenuSubmenuTrigger>
        <MenuSubmenuContent>
          <MenuRadioGroup
            value={connection.massStatus}
            onValueChange={(v) => onPatch({ massStatus: v as WhMass })}
          >
            {WH_MASSES.map((m) => (
              <MenuRadioItem key={m} value={m}>
                {capitalize(m)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubmenuContent>
      </MenuSubmenu>

      <MenuSubmenu>
        <MenuSubmenuTrigger inset>Jump mass</MenuSubmenuTrigger>
        <MenuSubmenuContent>
          <MenuRadioGroup
            value={connection.jumpMassClass ?? NONE_JUMP_MASS}
            onValueChange={(v) =>
              onPatch({ jumpMassClass: v === NONE_JUMP_MASS ? null : (v as WhJumpMass) })
            }
          >
            <MenuRadioItem value={NONE_JUMP_MASS}>unknown</MenuRadioItem>
            {WH_JUMP_MASSES.map((m) => (
              <MenuRadioItem key={m} value={m}>
                {m.toUpperCase()}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubmenuContent>
      </MenuSubmenu>

      <MenuSubmenu>
        <MenuSubmenuTrigger inset>Type</MenuSubmenuTrigger>
        <MenuSubmenuContent>
          <MenuRadioGroup
            value={connection.scope}
            onValueChange={(v) => onPatch({ scope: v as ConnectionScope })}
          >
            {CONNECTION_SCOPES.map((s) => (
              <MenuRadioItem key={s} value={s}>
                {capitalize(s)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubmenuContent>
      </MenuSubmenu>

      <MenuSubmenu>
        <MenuSubmenuTrigger inset>EOL</MenuSubmenuTrigger>
        <MenuSubmenuContent>
          <MenuRadioGroup
            value={connection.eolStage}
            onValueChange={(v) => onPatch({ eolStage: v as EolStage })}
          >
            {EOL_STAGES.map((s) => (
              <MenuRadioItem key={s} value={s}>
                {EOL_STAGE_LABELS[s]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubmenuContent>
      </MenuSubmenu>

      <MenuCheckboxItem
        checked={connection.preserveMass}
        onCheckedChange={(checked) => onPatch({ preserveMass: checked })}
      >
        Preserve mass
      </MenuCheckboxItem>

      <MenuCheckboxItem
        checked={connection.isRolling}
        onCheckedChange={(checked) => onPatch({ isRolling: checked })}
      >
        Rolling
      </MenuCheckboxItem>

      <MenuCheckboxItem
        checked={connection.isStatic}
        onCheckedChange={(checked) => onPatch({ isStatic: checked })}
      >
        Static
      </MenuCheckboxItem>

      <MenuSeparator />

      <MenuItem
        className="text-destructive data-highlighted:text-destructive"
        icon={<Trash2 className="size-3.5" />}
        onClick={onDelete}
      >
        Delete connection
      </MenuItem>
    </>
  );
}
