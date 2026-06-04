'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  SelectionMode,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import type {
  Breakpoint,
  MapContextMenuTarget,
  MapEventPayload,
  MapLayoutConfig,
  MapSettings,
  MapSystemNode,
  MapViewData,
  PanelId,
  StructureIntel,
} from '@/types';
import type { HubRoute } from '@/lib/map/route';
import type { SystemStatsSummary } from '@/lib/map/stats';
import type { SystemIntelSummary } from '@/lib/map/intel';
import { applyEvent } from '@/lib/map/applyEvent';
import {
  GRID_SIZE,
  findOpenPosition,
  overlaps,
  snapToGrid as snapPointToGrid,
  type Point,
} from '@/lib/map/placement';
import {
  addSystemOnServer,
  createConnectionOnServer,
  createSignatureOnServer,
  deleteConnectionOnServer,
  deleteSignatureOnServer,
  deleteSubchainOnServer,
  removeSystemOnServer,
  updateConnectionOnServer,
  updateSignatureOnServer,
  updateSystemOnServer,
  type CreateSignatureBody,
  type UpdateConnectionBody,
  type UpdateSignatureBody,
  type UpdateSystemBody,
} from '@/lib/map/client';
import { computeSubchain } from '@/lib/map/subchainGraph';
import {
  createStructureOnServer,
  deleteStructureOnServer,
  updateStructureOnServer,
} from '@/lib/structures/client';
import { mapUpdateLoadSchema } from '@/lib/realtime/protocol';
import { useMapSubscription, useRealtime } from '@/lib/realtime/useRealtime';
import { RouteModule } from '@/components/sidebar/RouteModule';
import { KillStatsModule } from '@/components/sidebar/KillStatsModule';
import { SystemGraphModule } from '@/components/sidebar/SystemGraphModule';
import { SystemKillboardModule } from '@/components/sidebar/SystemKillboardModule';
import { TagsModule } from '@/components/sidebar/TagsModule';
import { TheraModule } from '@/components/sidebar/TheraModule';
import { IntelModule } from '@/components/sidebar/IntelModule';
import { StructureModule } from '@/components/sidebar/StructureModule';
import type { StructureFormValues } from '@/components/sidebar/StructureFormDialog';
import { InspectorModule, type SelectionRef } from '@/components/sidebar/InspectorModule';
import { SignatureModule } from '@/components/sidebar/SignatureModule';
import { Info, LayoutDashboard, Plus, RotateCcw, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { MapInfoDialog } from '@/components/dialogs/MapInfoDialog';
import { MapSettingsDialog } from '@/components/dialogs/MapSettingsDialog';
import { AddSystemDialog } from './AddSystemDialog';
import { ConnectionEdge, type ConnectionEdgeData } from './ConnectionEdge';
import { MapPresenceProvider } from './MapPresenceContext';
import { SignaturePasteHotkey } from './SignaturePasteHotkey';
import { TransitSignaturePrompt } from './TransitSignaturePrompt';
import { MapTravelProvider, TravelBridge } from './MapTravelContext';
import { MapUnderglowProvider } from './MapUnderglowContext';
import { MapUnderglowBridge } from './MapUnderglowBridge';
import { SystemNode, type SystemNodeData } from './SystemNode';
import { MapContextMenu } from './MapContextMenu';
import { SubchainDeleteDialog } from './SubchainDeleteDialog';
import { SubchainDeletePrompt } from './SubchainDeletePrompt';
import { MapLayoutGrid } from './layout/MapLayoutGrid';
import { MapPanel } from './layout/MapPanel';
import { DEFAULT_MAP_LAYOUT, PANELS, ensurePanelsPlaced } from '@/lib/map/layout/panels';
import { setMapLayoutAction } from '@/app/(app)/actions/account';

// Debounce window for persisting layout edits (drag/resize/hide) to the server.
const LAYOUT_SAVE_DEBOUNCE_MS = 600;

// Union two breakpoints' layout arrays by item `i` (incoming wins). RGL only
// reports geometry for panels currently rendered, so a hidden panel's slot (and
// any panel not yet placed) is preserved from the previous state rather than
// dropped from the breakpoint on the next change.
function mergeLayouts(
  prev: Record<Breakpoint, Layout>,
  incoming: ResponsiveLayouts<Breakpoint>,
): Record<Breakpoint, Layout> {
  const next = { ...prev };
  for (const bp of Object.keys(incoming) as Breakpoint[]) {
    const incomingBp = incoming[bp];
    if (!incomingBp) continue;
    const incomingIds = new Set(incomingBp.map((item) => item.i));
    const kept = prev[bp].filter((item) => !incomingIds.has(item.i));
    next[bp] = [...incomingBp, ...kept];
  }
  return next;
}

const nodeTypes = { system: SystemNode };
const edgeTypes = { connection: ConnectionEdge };

export function MapCanvas({
  data,
  routes,
  stats,
  intel,
  structures: initialStructures,
  settings,
  travelAnimation,
  canConfigureTagging,
  viewerCharacterIds,
  mapLayout,
}: {
  data: MapViewData;
  routes: Record<number, HubRoute[]>;
  stats: Record<number, SystemStatsSummary>;
  intel: Record<number, SystemIntelSummary>;
  structures: Record<number, StructureIntel[]>;
  settings: MapSettings;
  travelAnimation: boolean;
  /** Owner/admin gate (Stage 17.10): shows the Map Settings "Tagging" tab. */
  canConfigureTagging: boolean;
  /** Viewer's account character ids — matched against presence for the CTRL+V fast-paste location check. */
  viewerCharacterIds: number[];
  /**
   * Saved per-account dashboard layout (map-layout-builder), or `null` to use
   * `DEFAULT_MAP_LAYOUT`. Accepted now but unused until the grid lands (Stage 3).
   */
  mapLayout?: MapLayoutConfig | null;
}) {
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  // The multi-select set; `selected` (above) remains the primary anchor that
  // drives the inspector and sidebar modules. Invariant: when
  // `selected?.kind === 'system'`, this set contains `selected.id`. Always
  // replaced with a fresh Set (never mutated) — the render-time sync block
  // detects changes by reference equality.
  const [selectedSystemIds, setSelectedSystemIds] = useState<Set<string>>(() => new Set());
  // Right-click context-menu target (independent of selection — right-click does
  // not change `selected`/`selectedSystemIds`). `null` ⇒ no menu open.
  const [contextMenu, setContextMenu] = useState<MapContextMenuTarget | null>(null);
  // Pending delete-subchain confirmation. The doomed systems are also highlighted
  // via `selectedSystemIds` while this is open. `null` ⇒ no dialog.
  const [subchainPreview, setSubchainPreview] = useState<{
    headId: string;
    anchorId: string | null;
    headName: string;
    names: string[];
  } | null>(null);
  // Non-blocking "also delete the subchain?" prompt, offered after a wormhole
  // sig with a populated "Leads to" is deleted. `null` ⇒ no prompt.
  const [subchainSigPrompt, setSubchainSigPrompt] = useState<{
    headId: string;
    anchorId: string;
    headName: string;
    count: number;
  } | null>(null);
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSystemOpen, setAddSystemOpen] = useState(false);
  const [viewData, setViewData] = useState<MapViewData>(data);
  // Captured via ReactFlow's onInit so the manual-add flow can place new nodes
  // at the current viewport centre rather than (0,0).
  const flowInstance = useRef<ReactFlowInstance<
    Node<SystemNodeData>,
    Edge<ConnectionEdgeData>
  > | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  // Client-space point set by the pane "Add system" action; consumed by the next
  // `onAddSystem` so the added node lands where the user right-clicked rather than
  // at the selection/viewport-centre default. Cleared once read.
  const pendingAddPoint = useRef<{ x: number; y: number } | null>(null);
  // True only while a drag-box selection is in progress. `onSelectionChange`
  // fires for our own click-driven selection echoes too; without this gate the
  // reconciler would fight the click handlers and loop. Box drag is the only
  // selection source we must adopt from xyflow.
  const boxSelecting = useRef(false);
  // Structure intel is deployment-global and not realtime-synced; we manage it
  // as plain local state seeded from the page load and updated on our own CRUD.
  const [structures, setStructures] = useState(initialStructures);
  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(() =>
    data.systems.map((s) => ({
      id: s.id,
      type: 'system' as const,
      position: { x: s.positionX, y: s.positionY },
      data: { ...s, isHome: s.id === data.map.homeMapSystemId },
      selected: false,
      draggable: !s.locked,
    })),
  );
  const appliedEventIds = useRef<Set<number>>(new Set());

  const [initialViewport] = useState<Viewport | null>(() => {
    try {
      const raw = localStorage.getItem(`aperture:map:${data.map.id}:viewport`);
      return raw ? (JSON.parse(raw) as Viewport) : null;
    } catch {
      return null;
    }
  });

  // ---- Free-form dashboard layout (map-layout-builder) -------------------
  // Seeded from the saved per-account layout; `null` ⇒ the default arrangement.
  // `ensurePanelsPlaced` auto-places any registered panel missing from a saved
  // layout (a panel that shipped after the user last saved) — forward-compat,
  // no data migration. A no-op for `DEFAULT_MAP_LAYOUT` (already complete).
  const [layout, setLayout] = useState<MapLayoutConfig>(() =>
    ensurePanelsPlaced(mapLayout ?? DEFAULT_MAP_LAYOUT),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // RGL fires `onLayoutChange` once on mount with its normalized layout; that
  // first call updates local state but must not persist (no spurious write per
  // map open). Subsequent (user-driven) changes save.
  const firstLayoutChange = useRef(true);

  const saveLayout = useCallback((config: MapLayoutConfig) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Fire-and-forget: a layout-preference write failing is non-critical.
      void setMapLayoutAction(config);
    }, LAYOUT_SAVE_DEBOUNCE_MS);
  }, []);

  // Flush nothing but cancel a pending debounce on unmount.
  useEffect(() => () => clearTimeout(saveTimer.current ?? undefined), []);

  const handleLayoutChange = useCallback(
    (_current: Layout, all: ResponsiveLayouts<Breakpoint>) => {
      setLayout((prev) => {
        const next: MapLayoutConfig = { ...prev, layouts: mergeLayouts(prev.layouts, all) };
        if (!firstLayoutChange.current) saveLayout(next);
        firstLayoutChange.current = false;
        return next;
      });
    },
    [saveLayout],
  );

  const handleHide = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        if (prev.hidden.includes(id)) return prev;
        const next: MapLayoutConfig = { ...prev, hidden: [...prev.hidden, id] };
        saveLayout(next);
        return next;
      });
    },
    [saveLayout],
  );

  // Panels-menu checkbox: flip a panel between hidden and visible. Re-showing a
  // panel returns it to its preserved slot — `mergeLayouts` keeps a hidden
  // panel's geometry, so the grid replaces it where it was, not at the bottom.
  const handleToggleVisible = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        const hidden = prev.hidden.includes(id)
          ? prev.hidden.filter((h) => h !== id)
          : [...prev.hidden, id];
        const next: MapLayoutConfig = { ...prev, hidden };
        saveLayout(next);
        return next;
      });
    },
    [saveLayout],
  );

  // Reset to the shipped arrangement. Clone so later immutable updates can never
  // mutate the shared `DEFAULT_MAP_LAYOUT` constant.
  const handleResetLayout = useCallback(() => {
    const next = structuredClone(DEFAULT_MAP_LAYOUT);
    setLayout(next);
    saveLayout(next);
  }, [saveLayout]);

  useMapSubscription(Number(data.map.id));
  const { lastEvent } = useRealtime();

  // ---- Realtime apply (with dedupe of our own optimistic echoes) ----------
  useEffect(() => {
    if (!lastEvent || lastEvent.task !== 'mapUpdate') return;
    const loadResult = mapUpdateLoadSchema.safeParse(lastEvent.load);
    if (!loadResult.success || !loadResult.data.data) return;
    const payload = loadResult.data.data;
    if (appliedEventIds.current.has(payload.eventId)) return;
    appliedEventIds.current.add(payload.eventId);
    setViewData((prev) => applyEvent(prev, payload));
  }, [lastEvent]);

  // ---- Optimistic-apply helpers (PATCH/DELETE) ---------------------------
  //
  // For PATCH/DELETE we apply locally first, snapshot for rollback, and dedupe
  // the realtime echo by its returned eventId. POST helpers (system add /
  // connection create / signature create) await the server payload and apply
  // through the normal path.
  const runOptimistic = useCallback(
    async (
      optimistic: MapEventPayload,
      run: () => Promise<
        { ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }
      >,
    ) => {
      let snapshot: MapViewData | null = null;
      setViewData((prev) => {
        snapshot = prev;
        return applyEvent(prev, optimistic);
      });
      const result = await run();
      if (result.ok) {
        appliedEventIds.current.add(result.eventId);
      } else if (snapshot) {
        setViewData(snapshot);
      }
    },
    [],
  );

  const awaitServer = useCallback(
    async (
      run: () => Promise<
        { ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }
      >,
    ) => {
      const result = await run();
      if (!result.ok) return;
      appliedEventIds.current.add(result.eventId);
      setViewData((prev) => applyEvent(prev, result.data));
    },
    [],
  );

  // Apply N event payloads in commit order and register each eventId in the
  // dedupe set — the bulk equivalent of `awaitServer`. Used by signature paste,
  // import, Thera sync, subchain delete, and manual add (system + gate links).
  const onBulkPaste = useCallback((payloads: MapEventPayload[]) => {
    if (payloads.length === 0) return;
    for (const p of payloads) appliedEventIds.current.add(p.eventId);
    setViewData((prev) => payloads.reduce(applyEvent, prev));
  }, []);

  // ---- xyflow → server callbacks -----------------------------------------
  const mapId = viewData.map.id;

  const onNodesChange = useCallback((changes: NodeChange<Node<SystemNodeData>>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // Commit the post-drag positions of every selected system. xyflow drags all
  // selected nodes in unison (same delta, formation preserved), writing their
  // live positions into `nodes` via onNodesChange; we read those back, snap
  // each, and PATCH it. The collision nudge runs only against *non-selected*
  // systems so an intra-group overlap never deforms the group. Unchanged
  // positions are skipped.
  const commitGroupMove = useCallback(() => {
    // Read live positions from xyflow's store (authoritative + synchronous at
    // dragStop) rather than the React `nodes` state, which can lag a frame.
    const live = flowInstance.current?.getNodes() ?? [];
    const occupiedOthers: Point[] = viewData.systems
      .filter((s) => !selectedSystemIds.has(s.id))
      .map((s) => ({ x: s.positionX, y: s.positionY }));
    for (const id of selectedSystemIds) {
      const node = live.find((n) => n.id === id);
      const existing = viewData.systems.find((s) => s.id === id);
      if (!node || !existing) continue;
      const snapped = snapPointToGrid(node.position);
      const final = occupiedOthers.some((o) => overlaps(snapped, o))
        ? findOpenPosition(snapped, occupiedOthers)
        : snapped;
      if (existing.positionX === final.x && existing.positionY === final.y) continue;
      const patch: UpdateSystemBody = { positionX: final.x, positionY: final.y };
      runOptimistic(
        { kind: 'system.updated', eventId: 0, id, positionX: final.x, positionY: final.y },
        () => updateSystemOnServer({ mapId, mapSystemId: id, patch }),
      );
    }
  }, [mapId, viewData.systems, selectedSystemIds, runOptimistic]);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | unknown, node: Node) => {
      // Dragging any member of a multi-selection moves the whole group; commit
      // every selected system's new position, not just the grabbed node.
      if (selectedSystemIds.size > 1 && selectedSystemIds.has(node.id)) {
        commitGroupMove();
        return;
      }
      const existing = viewData.systems.find((s) => s.id === node.id);
      if (!existing) return;
      // Snap the drop, then nudge to the nearest free slot only if it landed on
      // another node. Searching from the snapped drop keeps the nudge minimal.
      const snapped = snapPointToGrid(node.position);
      const occupiedOthers: Point[] = viewData.systems
        .filter((s) => s.id !== node.id)
        .map((s) => ({ x: s.positionX, y: s.positionY }));
      const final = occupiedOthers.some((o) => overlaps(snapped, o))
        ? findOpenPosition(snapped, occupiedOthers)
        : snapped;
      if (existing.positionX === final.x && existing.positionY === final.y) return;
      const patch: UpdateSystemBody = { positionX: final.x, positionY: final.y };
      runOptimistic(
        {
          kind: 'system.updated',
          eventId: 0,
          id: node.id,
          positionX: final.x,
          positionY: final.y,
        },
        () => updateSystemOnServer({ mapId, mapSystemId: node.id, patch }),
      );
    },
    [mapId, viewData.systems, selectedSystemIds, commitGroupMove, runOptimistic],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      awaitServer(() =>
        createConnectionOnServer({
          mapId,
          body: {
            sourceMapSystemId: params.source!,
            targetMapSystemId: params.target!,
            scope: 'wh',
          },
        }),
      );
    },
    [mapId, awaitServer],
  );

  // Manually place a system on the map (no wormhole jump). Anchor on the
  // selected system's position when one is selected, else the viewport centre
  // (falling back to (0,0) before the instance is ready), then settle into the
  // nearest open, grid-aligned slot so adds never overlap existing nodes.
  // POST → fold the returned payloads (the new system + any auto-created gate
  // links to systems already on the map) like a bulk paste.
  const onAddSystem = useCallback(
    (systemId: number) => {
      const occupied: Point[] = viewData.systems.map((s) => ({ x: s.positionX, y: s.positionY }));
      let anchor: Point | null = null;
      const pending = pendingAddPoint.current;
      if (pending) {
        pendingAddPoint.current = null;
        const inst = flowInstance.current;
        if (inst) anchor = inst.screenToFlowPosition({ x: pending.x, y: pending.y });
      }
      if (!anchor && selected?.kind === 'system') {
        const sel = viewData.systems.find((s) => s.id === selected.id);
        if (sel) anchor = { x: sel.positionX, y: sel.positionY };
      }
      if (!anchor) {
        anchor = { x: 0, y: 0 };
        const inst = flowInstance.current;
        const wrap = flowWrapperRef.current;
        if (inst && wrap) {
          const rect = wrap.getBoundingClientRect();
          anchor = inst.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }
      }
      const pos = findOpenPosition(anchor, occupied);
      void addSystemOnServer({
        mapId,
        systemId,
        positionX: pos.x,
        positionY: pos.y,
      }).then((result) => {
        if (result.ok) onBulkPaste(result.data.payloads);
      });
    },
    [mapId, onBulkPaste, selected, viewData.systems],
  );

  // Pane "Add system" entry point: remember the cursor point so `onAddSystem`
  // places the chosen system there, then open the existing picker dialog.
  const onAddSystemAt = useCallback((clientX: number, clientY: number) => {
    pendingAddPoint.current = { x: clientX, y: clientY };
    setContextMenu(null);
    setAddSystemOpen(true);
  }, []);

  // Click selection is driven by direct handlers (they own single + Ctrl+click
  // toggle), while `onSelectionChange` is used only as a box-select reconciler
  // (see below). The two don't fight because the reconciler ignores size<=1 and
  // no-ops when xyflow's set already matches ours.
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Ctrl/Cmd+click toggles the node in the group. The inspector primary is
      // cleared whenever 2+ are selected — a multi-select group drives no
      // inspector / per-system module (which would otherwise thrash on refetch);
      // a lone survivor re-populates it.
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(selectedSystemIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        setSelectedSystemIds(next);
        setSelected(next.size === 1 ? { kind: 'system', id: next.values().next().value! } : null);
        return;
      }
      setSelected({ kind: 'system', id: node.id });
      setSelectedSystemIds(new Set([node.id]));
    },
    [selectedSystemIds],
  );

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelected({ kind: 'connection', id: edge.id });
    setSelectedSystemIds(new Set());
  }, []);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedSystemIds(new Set());
  }, []);

  // Right-click handlers. Each suppresses the native browser menu and stores the
  // cursor point + target; selection is intentionally left untouched.
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ kind: 'system', id: node.id, x: event.clientX, y: event.clientY });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({ kind: 'connection', id: edge.id, x: event.clientX, y: event.clientY });
  }, []);

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
  }, []);

  const onSelectionStart = useCallback(() => {
    boxSelecting.current = true;
  }, []);

  const onSelectionEnd = useCallback(() => {
    boxSelecting.current = false;
  }, []);

  // Box-select-only reconciler. xyflow fires `onSelectionChange` for *every*
  // selection mutation — including the echoes of our own click handlers — so we
  // adopt only while a drag box is active (`boxSelecting`). Adopting on click
  // echoes would fight the click handlers and loop. Single/empty stay owned by
  // the click/pane handlers; the diff check skips a no-op rebuild. The inspector
  // primary is cleared (same rule as Ctrl+click) so the box drag doesn't thrash
  // the per-system modules as nodes enter the rectangle.
  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: OnSelectionChangeParams) => {
      if (!boxSelecting.current || selNodes.length <= 1) return;
      const ids = selNodes.map((n) => n.id);
      if (ids.length === selectedSystemIds.size && ids.every((id) => selectedSystemIds.has(id))) {
        return;
      }
      setSelectedSystemIds(new Set(ids));
      setSelected(null);
    },
    [selectedSystemIds],
  );

  // ---- Inspector callbacks -----------------------------------------------
  const onSystemPatch = useCallback(
    (mapSystemId: string, patch: UpdateSystemBody) => {
      const opt: MapEventPayload = {
        kind: 'system.updated',
        eventId: 0,
        id: mapSystemId,
        ...patch,
      };
      runOptimistic(opt, () => updateSystemOnServer({ mapId, mapSystemId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onSystemRemove = useCallback(
    (mapSystemId: string) => {
      runOptimistic({ kind: 'system.removed', eventId: 0, id: mapSystemId }, () =>
        removeSystemOnServer({ mapId, mapSystemId }),
      );
      setSelected(null);
      setSelectedSystemIds(new Set());
    },
    [mapId, runOptimistic],
  );

  // Group delete — shared by the Delete/Backspace key handler and the floating
  // "Remove N" button. Loops the existing single-item DELETE endpoint (the
  // onBulkPaste precedent: small, hand-selected groups need no batch endpoint).
  const removeSelectedSystems = useCallback(() => {
    if (selectedSystemIds.size === 0) return;
    for (const id of selectedSystemIds) {
      runOptimistic({ kind: 'system.removed', eventId: 0, id }, () =>
        removeSystemOnServer({ mapId, mapSystemId: id }),
      );
    }
    setSelected(null);
    setSelectedSystemIds(new Set());
  }, [mapId, runOptimistic, selectedSystemIds]);

  // Delete/Backspace removes the whole selection. Gated against text inputs so
  // editing an alias / signature field never deletes systems.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (selectedSystemIds.size === 0) return;
      e.preventDefault();
      removeSelectedSystems();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedSystemIds, removeSelectedSystems]);

  const onConnectionPatch = useCallback(
    (connectionId: string, patch: UpdateConnectionBody) => {
      const opt: MapEventPayload = {
        kind: 'connection.update',
        eventId: 0,
        id: connectionId,
        ...patch,
      };
      runOptimistic(opt, () => updateConnectionOnServer({ mapId, connectionId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onConnectionDelete = useCallback(
    (connectionId: string) => {
      runOptimistic({ kind: 'connection.delete', eventId: 0, id: connectionId }, () =>
        deleteConnectionOnServer({ mapId, connectionId }),
      );
      setSelected(null);
    },
    [mapId, runOptimistic],
  );

  const onSignatureCreate = useCallback(
    (body: CreateSignatureBody) => {
      awaitServer(() => createSignatureOnServer({ mapId, body }));
    },
    [mapId, awaitServer],
  );

  const onSignaturePatch = useCallback(
    (signatureId: string, patch: UpdateSignatureBody) => {
      const opt: MapEventPayload = {
        kind: 'signature.update',
        eventId: 0,
        id: signatureId,
        ...patch,
      };
      runOptimistic(opt, () => updateSignatureOnServer({ mapId, signatureId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onSignatureDelete = useCallback(
    (signatureId: string) => {
      const sig = viewData.signatures.find((s) => s.id === signatureId);
      runOptimistic({ kind: 'signature.delete', eventId: 0, id: signatureId }, () =>
        deleteSignatureOnServer({ mapId, signatureId }),
      );
      // If the sig resolved to a wormhole, offer to delete the subchain behind
      // it. Head = the connection's far end; anchor mirrors the two context-menu
      // paths (Home when set, else the sig's own system — always a neighbour of
      // head). Bail quietly on any missing piece or an empty subchain.
      if (!sig || sig.mapConnectionId == null) return;
      const conn = viewData.connections.find((c) => c.id === sig.mapConnectionId);
      if (!conn) return;
      const headId = conn.source === sig.mapSystemId ? conn.target : conn.source;
      const anchorId = viewData.map.homeMapSystemId ?? sig.mapSystemId;
      const ids = computeSubchain({
        systems: viewData.systems,
        connections: viewData.connections,
        headId,
        anchorId,
      });
      if (ids.size === 0) return;
      const head = viewData.systems.find((s) => s.id === headId);
      setSubchainSigPrompt({
        headId,
        anchorId,
        headName: head ? head.alias?.trim() || head.name : headId,
        count: ids.size,
      });
    },
    [mapId, runOptimistic, viewData],
  );

  // ---- Delete subchain ----------------------------------------------------
  // Compute the doomed set from the current view (head + everything orphaned
  // from the keep-side anchor), highlight it, and open the confirm dialog. The
  // server recomputes the set authoritatively on confirm.
  const openSubchainPreview = useCallback(
    (headId: string, anchorId: string) => {
      const ids = computeSubchain({
        systems: viewData.systems,
        connections: viewData.connections,
        headId,
        anchorId,
      });
      if (ids.size === 0) return;
      const byId = new Map(viewData.systems.map((s) => [s.id, s]));
      const nameOf = (id: string) => {
        const s = byId.get(id);
        return s ? s.alias?.trim() || s.name : id;
      };
      setSelected(null);
      setSelectedSystemIds(new Set(ids));
      setSubchainPreview({
        headId,
        anchorId,
        headName: nameOf(headId),
        names: [...ids].map(nameOf).sort((a, b) => a.localeCompare(b)),
      });
    },
    [viewData],
  );

  const onDeleteSubchain = useCallback(
    (headId: string) => {
      const homeId = viewData.map.homeMapSystemId;
      if (homeId === null) return; // the menu only offers this when a Home is set
      openSubchainPreview(headId, homeId);
    },
    [viewData.map.homeMapSystemId, openSubchainPreview],
  );

  const onDeleteSubchainPick = useCallback(
    (headId: string, anchorId: string) => openSubchainPreview(headId, anchorId),
    [openSubchainPreview],
  );

  const onCancelSubchain = useCallback(() => {
    setSubchainPreview(null);
    setSelectedSystemIds(new Set());
  }, []);

  const onConfirmSubchain = useCallback(async () => {
    if (!subchainPreview) return;
    const { headId, anchorId } = subchainPreview;
    setSubchainPreview(null);
    const result = await deleteSubchainOnServer({
      mapId,
      headMapSystemId: headId,
      anchorMapSystemId: anchorId,
    });
    if (result.ok) onBulkPaste(result.data.payloads);
    setSelectedSystemIds(new Set());
  }, [subchainPreview, mapId, onBulkPaste]);

  const onConfirmSubchainSig = useCallback(async () => {
    if (!subchainSigPrompt) return;
    const { headId, anchorId } = subchainSigPrompt;
    setSubchainSigPrompt(null);
    const result = await deleteSubchainOnServer({
      mapId,
      headMapSystemId: headId,
      anchorMapSystemId: anchorId,
    });
    if (result.ok) onBulkPaste(result.data.payloads);
  }, [subchainSigPrompt, mapId, onBulkPaste]);

  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, vp: Viewport) => {
      localStorage.setItem(`aperture:map:${mapId}:viewport`, JSON.stringify(vp));
    },
    [mapId],
  );

  const onAliasOrTagCommit = useCallback(
    (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => {
      onSystemPatch(mapSystemId, { [field]: next });
    },
    [onSystemPatch],
  );

  // ---- xyflow nodes/edges ------------------------------------------------
  //
  // `nodes` is xyflow-managed via `applyNodeChanges` (so the visual drag is
  // smooth — without `onNodesChange` xyflow would emit position events with
  // nowhere to land). When `viewData.systems` or `selectedSystemIds` change we
  // reconcile xyflow's nodes state against them, preserving each node's
  // in-flight drag position (xyflow sets `dragging: true` mid-drag) and
  // xyflow-internal fields (`measured`, etc.) by spreading the existing node
  // — without that xyflow would re-measure on every sync and the nodes
  // briefly flicker out. We sync during render (rather than in an effect) so
  // React discards the pre-sync render before commit instead of cascading.
  // `onAliasOrTagCommit` isn't in the sync key because it's stable for the
  // component's lifetime (its dep chain bottoms out at `mapId` + `useCallback`s
  // with empty deps).
  const [lastSync, setLastSync] = useState<{
    systems: MapViewData['systems'];
    selectedSystemIds: Set<string>;
  } | null>(null);
  if (
    !lastSync ||
    lastSync.systems !== viewData.systems ||
    lastSync.selectedSystemIds !== selectedSystemIds
  ) {
    setLastSync({ systems: viewData.systems, selectedSystemIds });
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return viewData.systems.map((s) => {
        const existing = prevById.get(s.id);
        const position = existing?.dragging
          ? existing.position
          : { x: s.positionX, y: s.positionY };
        return {
          ...(existing ?? {}),
          id: s.id,
          type: 'system' as const,
          position,
          data: { ...s, onAliasOrTagCommit, isHome: s.id === viewData.map.homeMapSystemId },
          selected: selectedSystemIds.has(s.id),
          draggable: !s.locked,
        };
      });
    });
  }

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(() => {
    // Group connections by canonical node pair (sorted) so parallel edges
    // (multiple wormholes between the same two systems) can be fanned out.
    const groups = new Map<string, string[]>();
    for (const c of viewData.connections) {
      const key = [c.source, c.target].sort().join('\0');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c.id);
    }
    for (const ids of groups.values()) ids.sort();

    return viewData.connections.map((c) => {
      const key = [c.source, c.target].sort().join('\0');
      const group = groups.get(key)!;
      const parallelIndex = group.indexOf(c.id);
      const parallelCount = group.length;
      return {
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: { ...c, parallelIndex, parallelCount },
        selected: selected?.kind === 'connection' && selected.id === c.id,
      };
    });
  }, [viewData.connections, selected]);

  const selectedSystem: MapSystemNode | null = useMemo(() => {
    if (selected?.kind !== 'system') return null;
    return viewData.systems.find((s) => s.id === selected.id) ?? null;
  }, [selected, viewData.systems]);

  // EVE solar-system ids already placed — lets the add dialog flag duplicates.
  const existingSystemIds = useMemo(
    () => new Set(viewData.systems.map((s) => s.systemId)),
    [viewData.systems],
  );

  // ---- Structure-intel callbacks -----------------------------------------
  //
  // Plain REST (no map event, no realtime echo): await the server, then update
  // local state with the returned row. Failures already toast via the client
  // wrappers, so we just leave local state untouched.
  const sortByName = (a: StructureIntel, b: StructureIntel) => a.name.localeCompare(b.name);

  const onStructureCreate = useCallback(
    async (values: StructureFormValues) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await createStructureOnServer({ systemId, ...values });
      if (!result.ok) return;
      setStructures((prev) => ({
        ...prev,
        [systemId]: [...(prev[systemId] ?? []), result.data].sort(sortByName),
      }));
    },
    [selectedSystem],
  );

  const onStructurePatch = useCallback(async (structureId: string, values: StructureFormValues) => {
    const result = await updateStructureOnServer({ structureId, patch: values });
    if (!result.ok) return;
    const updated = result.data;
    setStructures((prev) => ({
      ...prev,
      [updated.systemId]: (prev[updated.systemId] ?? [])
        .map((s) => (s.id === structureId ? updated : s))
        .sort(sortByName),
    }));
  }, []);

  const onStructureDelete = useCallback(
    async (structureId: string) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await deleteStructureOnServer({ structureId });
      if (!result.ok) return;
      setStructures((prev) => ({
        ...prev,
        [systemId]: (prev[systemId] ?? []).filter((s) => s.id !== structureId),
      }));
    },
    [selectedSystem],
  );

  // Panels the user hasn't hidden, in registry order. Order is cosmetic — the
  // grid positions by each item's `i`, not by child order.
  const visiblePanels = PANELS.filter((p) => !layout.hidden.includes(p.id));

  // The JSX for one panel's body. The canvas keeps its own positioned wrapper
  // (overlays + menu + dialog); the rest are the existing sidebar/signature
  // modules with unchanged props.
  const panelContent = (id: PanelId) => {
    switch (id) {
      case 'canvas':
        return (
          <div
            ref={flowWrapperRef}
            className="relative h-full overflow-hidden rounded-lg ring-1 ring-foreground/10"
          >
            {selectedSystemIds.size > 1 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={removeSelectedSystems}
                className="nodrag nopan absolute right-2 top-2 z-10"
              >
                <Trash2 />
                Remove {selectedSystemIds.size}
              </Button>
            )}
            <TransitSignaturePrompt
              mapId={mapId}
              systems={viewData.systems}
              connections={viewData.connections}
              signatures={viewData.signatures}
              viewerCharacterIds={viewerCharacterIds}
              onPatchSignature={onSignaturePatch}
              onConnectionPatch={onConnectionPatch}
            />
            {subchainSigPrompt && (
              <SubchainDeletePrompt
                headName={subchainSigPrompt.headName}
                count={subchainSigPrompt.count}
                onConfirm={onConfirmSubchainSig}
                onDismiss={() => setSubchainSigPrompt(null)}
              />
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onSelectionStart={onSelectionStart}
              onSelectionEnd={onSelectionEnd}
              onSelectionChange={onSelectionChange}
              onInit={(inst) => {
                flowInstance.current = inst;
              }}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              snapToGrid
              snapGrid={[GRID_SIZE, GRID_SIZE]}
              nodesDraggable
              nodesConnectable
              selectionKeyCode={['Control', 'Meta']}
              multiSelectionKeyCode={['Control', 'Meta']}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={null}
              connectionMode={ConnectionMode.Loose}
              edgesFocusable
              colorMode="dark"
              fitView={initialViewport === null}
              defaultViewport={initialViewport ?? undefined}
              zoomOnScroll={false}
              preventScrolling={false}
              onMoveEnd={onMoveEnd}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
            <MapContextMenu
              target={contextMenu}
              onClose={() => setContextMenu(null)}
              systems={viewData.systems}
              connections={viewData.connections}
              homeMapSystemId={viewData.map.homeMapSystemId}
              onSystemPatch={onSystemPatch}
              onSystemRemove={onSystemRemove}
              onConnectionPatch={onConnectionPatch}
              onConnectionDelete={onConnectionDelete}
              onAddSystemAt={onAddSystemAt}
              onDeleteSubchain={onDeleteSubchain}
              onDeleteSubchainPick={onDeleteSubchainPick}
            />
            <SubchainDeleteDialog
              open={subchainPreview !== null}
              headName={subchainPreview?.headName ?? ''}
              systemNames={subchainPreview?.names ?? []}
              onConfirm={onConfirmSubchain}
              onCancel={onCancelSubchain}
            />
          </div>
        );
      case 'signatures':
        return (
          <SignatureModule
            mapId={mapId}
            system={selectedSystem}
            signatures={viewData.signatures}
            connections={viewData.connections}
            systems={viewData.systems}
            onCreate={onSignatureCreate}
            onPatch={onSignaturePatch}
            onDelete={onSignatureDelete}
            onBulkPaste={onBulkPaste}
            onConnectionPatch={onConnectionPatch}
          />
        );
      case 'inspector':
        return (
          <InspectorModule
            selected={selected}
            viewData={viewData}
            onSystemPatch={onSystemPatch}
            onSystemRemove={onSystemRemove}
            onConnectionPatch={onConnectionPatch}
            onConnectionDelete={onConnectionDelete}
          />
        );
      case 'route':
        return (
          <RouteModule
            system={selectedSystem}
            routes={selectedSystem ? routes[selectedSystem.systemId] : undefined}
          />
        );
      case 'intel':
        return (
          <IntelModule
            system={selectedSystem}
            intel={selectedSystem ? intel[selectedSystem.systemId] : undefined}
          />
        );
      case 'structure':
        return (
          <StructureModule
            system={selectedSystem}
            structures={selectedSystem ? (structures[selectedSystem.systemId] ?? []) : []}
            onCreate={onStructureCreate}
            onPatch={onStructurePatch}
            onDelete={onStructureDelete}
          />
        );
      case 'killStats':
        return (
          <KillStatsModule
            system={selectedSystem}
            stats={selectedSystem ? stats[selectedSystem.systemId] : undefined}
          />
        );
      case 'systemGraph':
        return <SystemGraphModule system={selectedSystem} />;
      case 'systemKillboard':
        return <SystemKillboardModule system={selectedSystem} />;
      case 'tags':
        return <TagsModule viewData={viewData} selectedSystemId={selectedSystem?.id ?? null} />;
      case 'thera':
        return <TheraModule mapId={mapId} viewData={viewData} onBulkPaste={onBulkPaste} />;
    }
  };

  return (
    <MapPresenceProvider initial={data.presence}>
      <MapTravelProvider>
        <MapUnderglowProvider>
        {travelAnimation && (
          <TravelBridge systems={viewData.systems} connections={viewData.connections} />
        )}
        <MapUnderglowBridge systems={viewData.systems} />
        <SignaturePasteHotkey
          mapId={mapId}
          selectedSystem={selectedSystem}
          systems={viewData.systems}
          viewerCharacterIds={viewerCharacterIds}
          onBulkPaste={onBulkPaste}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="font-heading truncate text-base font-semibold tracking-tight">
                {viewData.map.name}
              </div>
              <div className="text-muted-foreground truncate text-xs capitalize">
                {viewData.map.type} · {viewData.map.scope} · {viewData.systems.length} systems
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Menu>
                <MenuTrigger
                  render={
                    <Button variant="ghost" size="sm">
                      <LayoutDashboard />
                      Panels
                    </Button>
                  }
                />
                <MenuContent>
                  {PANELS.map((p) => (
                    <MenuCheckboxItem
                      key={p.id}
                      checked={!layout.hidden.includes(p.id)}
                      onCheckedChange={() => handleToggleVisible(p.id)}
                    >
                      {p.title}
                    </MenuCheckboxItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem icon={<RotateCcw />} onClick={handleResetLayout}>
                    Reset layout
                  </MenuItem>
                </MenuContent>
              </Menu>
              <Button variant="ghost" size="sm" onClick={() => setAddSystemOpen(true)}>
                <Plus />
                Add system
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMapInfoOpen(true)}>
                <Info />
                Map info
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings />
                Settings
              </Button>
            </div>
          </div>
          <MapLayoutGrid layouts={layout.layouts} onLayoutChange={handleLayoutChange}>
            {visiblePanels.map((p) => (
              <div key={p.id}>
                <MapPanel
                  id={p.id}
                  title={p.title}
                  onHide={handleHide}
                  contentClassName={
                    p.id === 'canvas' ? 'min-h-0 flex-1 overflow-hidden p-0' : undefined
                  }
                >
                  {panelContent(p.id)}
                </MapPanel>
              </div>
            ))}
          </MapLayoutGrid>
        </div>

        <MapInfoDialog open={mapInfoOpen} onOpenChange={setMapInfoOpen} viewData={viewData} />
        <MapSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          mapId={mapId}
          settings={settings}
          onImported={onBulkPaste}
          canConfigureTagging={canConfigureTagging}
          systems={viewData.systems}
        />
        <AddSystemDialog
          open={addSystemOpen}
          onOpenChange={setAddSystemOpen}
          mapId={mapId}
          existingSystemIds={existingSystemIds}
          onAdd={onAddSystem}
        />
        </MapUnderglowProvider>
      </MapTravelProvider>
    </MapPresenceProvider>
  );
}
