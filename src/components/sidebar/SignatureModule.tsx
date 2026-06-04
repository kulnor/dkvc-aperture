'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WormholeTypeSelect } from './WormholeTypeSelect';
import { SignatureGroupSelect } from './SignatureGroupSelect';
import { ConnectionSelect } from './ConnectionSelect';
import { SiteTypeCombobox } from './SiteTypeCombobox';
import { SignaturePasteDialog } from '@/components/dialogs/SignaturePasteDialog';
import type {
  MapConnectionEdge,
  MapEventPayload,
  MapSignature,
  MapSystemNode,
  SignatureGroupKey,
} from '@/types';
import type {
  CreateSignatureBody,
  UpdateConnectionBody,
  UpdateSignatureBody,
} from '@/lib/map/client';
import type { WhJumpMass } from '@/lib/map/enumLabels';
import { fetchWormholeTypes } from '@/lib/map/client';
import { formatAgoFromMs, formatRelativeFromMs } from '@/lib/map/relativeTime';
import { apertureConfig } from '../../../aperture.config';

/**
 * Recolors the cell's control border to `destructive` so an unfilled required
 * field (group / type / leads-to) reads red at a glance — the Pathfinder cue
 * for a not-yet-fully-scanned sig. Applied to the `<td>`; targets the inner
 * select trigger or text input by their `data-slot`.
 */
const MISSING_CELL =
  '[&_[data-slot=select-trigger]]:border-destructive [&_[data-slot=input]]:border-destructive';

function defaultExpiry(): string {
  return new Date(Date.now() + apertureConfig.SIGNATURE_DEFAULT_TTL_MS).toISOString();
}

function formatRelativeIso(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  return formatRelativeFromMs(ts - Date.now());
}

function formatAgoIso(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  return formatAgoFromMs(Date.now() - ts);
}

type WormholeTypeMeta = {
  /** Destination class label (e.g. U210 → `LS`); null = resolved from far side. */
  targetClass: string | null;
  /** Inferred per-jump connection size band; null = can't infer (e.g. K162). */
  jumpMassClass: WhJumpMass | null;
};

/**
 * Resolves `universe_wormhole.type_id` → its destination class and inferred
 * jump-mass band for the host system. The target class filters the "Leads to"
 * dropdown to connections the WH type could open onto; the jump-mass band drives
 * the auto-set of a linked connection's size. Reads from the same
 * per-(mapId, systemId) cache `WormholeTypeSelect` populates, so this is usually
 * a free in-memory hit rather than a second network round-trip.
 */
function useWormholeTypeMeta(
  mapId: string,
  universeSystemId: number,
): Map<number, WormholeTypeMeta> {
  const [byTypeId, setByTypeId] = useState<Map<number, WormholeTypeMeta>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchWormholeTypes({ mapId, universeSystemId }).then((result) => {
      if (cancelled || !result.ok) return;
      setByTypeId(
        new Map(
          result.data.map((o) => [
            o.typeId,
            { targetClass: o.targetClass, jumpMassClass: o.jumpMassClass },
          ]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mapId, universeSystemId]);
  return byTypeId;
}

/**
 * Standalone Signatures panel rendered below the map. Presentational —
 * mutation callbacks are owned by `MapCanvas` (which wraps them with
 * optimistic apply / reconcile). Renders an empty state when no system is
 * selected.
 */
export function SignatureModule({
  mapId,
  system,
  signatures,
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onBulkPaste,
  onConnectionPatch,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
  onBulkPaste: (payloads: MapEventPayload[]) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">
          Signatures{system ? ` — ${system.alias ?? system.name}` : ''}
        </CardTitle>
        {system && (
          <SignaturePasteButton
            mapId={mapId}
            system={system}
            signatures={signatures}
            onBulkPaste={onBulkPaste}
          />
        )}
      </CardHeader>
      <CardContent>
        {!system ? (
          <p className="text-xs text-muted-foreground">
            Select a system on the map to view its signatures.
          </p>
        ) : (
          <SignaturePanelBody
            key={system.id}
            mapId={mapId}
            system={system}
            signatures={signatures}
            connections={connections}
            systems={systems}
            onCreate={onCreate}
            onPatch={onPatch}
            onDelete={onDelete}
            onConnectionPatch={onConnectionPatch}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SignaturePasteButton({
  mapId,
  system,
  signatures,
  onBulkPaste,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  onBulkPaste: (payloads: MapEventPayload[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => signatures.filter((s) => s.mapSystemId === system.id),
    [signatures, system.id],
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ClipboardPaste className="size-3.5" />
        Paste from scanner
      </Button>
      <SignaturePasteDialog
        open={open}
        onOpenChange={setOpen}
        mapId={mapId}
        mapSystemId={system.id}
        existingSigs={rows}
        onResult={onBulkPaste}
      />
    </>
  );
}

function SignaturePanelBody({
  mapId,
  system,
  signatures,
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onConnectionPatch,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
}) {
  const rows = useMemo(
    () => signatures.filter((s) => s.mapSystemId === system.id),
    [signatures, system.id],
  );

  const metaByTypeId = useWormholeTypeMeta(mapId, system.systemId);

  // Connections already claimed by a sig in this system. The sig↔connection
  // binding is 1:1, so these are hidden from the "Leads to" dropdown (each
  // ConnectionSelect exempts its own current value).
  const assignedConnectionIds = useMemo(
    () => rows.map((s) => s.mapConnectionId).filter((id): id is string => id != null),
    [rows],
  );

  /**
   * When a WH sig ends up with both a type and a linked connection, push the
   * type's inferred jump-mass band onto that connection (e.g. O477 → L). A type
   * whose band can't be inferred (K162 and friends) leaves the connection size
   * untouched. Fired from both the type and the "Leads to" change handlers so
   * setting either side last completes the inference.
   */
  function syncConnectionSize(typeId: number | null, connectionId: string | null) {
    if (typeId == null || connectionId == null) return;
    const band = metaByTypeId.get(typeId)?.jumpMassClass ?? null;
    if (band == null) return;
    onConnectionPatch(connectionId, { jumpMassClass: band });
  }

  const [draftSigId, setDraftSigId] = useState('');
  const [draftGroupKey, setDraftGroupKey] = useState<SignatureGroupKey | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftTypeId, setDraftTypeId] = useState<number | null>(null);
  const [draftConnectionId, setDraftConnectionId] = useState<string | null>(null);

  function submit() {
    if (draftSigId.trim().length === 0) return;
    const isWh = draftGroupKey === 'wormhole';
    onCreate({
      mapSystemId: system.id,
      sigId: draftSigId.trim().toUpperCase(),
      groupKey: draftGroupKey,
      typeId: isWh ? draftTypeId : null,
      name: isWh ? null : (draftName.trim() || null),
      mapConnectionId: isWh ? draftConnectionId : null,
      expiresAt: defaultExpiry(),
    });
    if (isWh) syncConnectionSize(draftTypeId, draftConnectionId);
    setDraftSigId('');
    setDraftGroupKey(null);
    setDraftName('');
    setDraftTypeId(null);
    setDraftConnectionId(null);
  }

  /**
   * Build a Group-change patch including the cascading nulls. Always clears
   * `typeId` and `name`; clears `mapConnectionId` when the previous row was a
   * wormhole and the new group isn't (or vice versa, since the connection is
   * only valid for wormhole sigs).
   */
  function buildGroupChangePatch(
    prev: MapSignature,
    nextKey: SignatureGroupKey | null,
  ): UpdateSignatureBody {
    const patch: UpdateSignatureBody = {
      groupKey: nextKey,
      typeId: null,
      name: null,
    };
    const wasWormhole = prev.groupKey === 'wormhole';
    const isWormhole = nextKey === 'wormhole';
    if (wasWormhole !== isWormhole) patch.mapConnectionId = null;
    return patch;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-24 px-2 py-1 text-left">Sig</th>
              <th className="w-32 px-3 py-1 text-left">Group</th>
              <th className="w-56 px-3 py-1 text-left">Type</th>
              <th className="px-3 py-1 text-left">Description</th>
              <th className="w-44 px-3 py-1 text-left">Leads to</th>
              <th className="w-16 px-1 py-1 text-left">TTL</th>
              <th className="w-24 px-1 py-1 text-left">Created</th>
              <th className="w-24 px-1 py-1 text-left">Updated</th>
              <th className="w-10 px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No signatures.
                </td>
              </tr>
            )}
            {rows.map((sig) => {
              // Fully scanned = sig + group + type (+ "leads to" for wormholes).
              // Flag each still-empty required cell so it reads red on its own.
              const groupMissing = sig.groupKey === null;
              const typeMissing =
                sig.groupKey !== null &&
                (sig.groupKey === 'wormhole' ? sig.typeId === null : !sig.name);
              const leadsToMissing =
                sig.groupKey === 'wormhole' && sig.mapConnectionId === null;
              return (
              <tr key={sig.id} className="border-t border-foreground/10 align-middle">
                <td className="px-2 py-1 font-mono text-xs">{sig.sigId}</td>
                <td className={`px-1 py-0.5${groupMissing ? ` ${MISSING_CELL}` : ''}`}>
                  <SignatureGroupSelect
                    value={sig.groupKey}
                    onValueChange={(nextKey) => {
                      if (nextKey === sig.groupKey) return;
                      onPatch(sig.id, buildGroupChangePatch(sig, nextKey));
                    }}
                  />
                </td>
                <td className={`px-1 py-0.5${typeMissing ? ` ${MISSING_CELL}` : ''}`}>
                  <TypeCell
                    mapId={mapId}
                    system={system}
                    sig={sig}
                    onPatch={onPatch}
                    onSyncConnectionSize={syncConnectionSize}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <EditableTextCell
                    value={sig.description ?? ''}
                    onCommit={(next) => onPatch(sig.id, { description: next || null })}
                    className="h-7 text-sm"
                    placeholder="—"
                  />
                </td>
                <td className={`px-1 py-0.5${leadsToMissing ? ` ${MISSING_CELL}` : ''}`}>
                  <ConnectionSelect
                    system={system}
                    connections={connections}
                    systems={systems}
                    value={sig.mapConnectionId}
                    onValueChange={(next) => {
                      onPatch(sig.id, { mapConnectionId: next });
                      syncConnectionSize(sig.typeId, next);
                    }}
                    disabled={sig.groupKey !== 'wormhole'}
                    targetClass={
                      sig.typeId == null ? null : metaByTypeId.get(sig.typeId)?.targetClass ?? null
                    }
                    excludeIds={assignedConnectionIds}
                  />
                </td>
                <td className="px-1 py-0.5 text-xs text-muted-foreground">
                  {formatRelativeIso(sig.expiresAt)}
                </td>
                <td className="px-1 py-0.5 text-xs text-muted-foreground">
                  {formatAgoIso(sig.createdAt)}
                </td>
                <td className="px-1 py-0.5 text-xs text-muted-foreground">
                  {formatAgoIso(sig.updatedAt)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete signature"
                    onClick={() => onDelete(sig.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Sig</span>
          <Input
            value={draftSigId}
            onChange={(e) => setDraftSigId(e.target.value.toUpperCase())}
            className="h-8 w-20 font-mono"
            placeholder="ABC"
            maxLength={7}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Group</span>
          <SignatureGroupSelect
            value={draftGroupKey}
            onValueChange={(next) => {
              if (next === draftGroupKey) return;
              setDraftGroupKey(next);
              setDraftTypeId(null);
              setDraftName('');
              setDraftConnectionId(null);
            }}
          />
        </div>
        <div className="flex w-56 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Type</span>
          {draftGroupKey === 'wormhole' ? (
            <WormholeTypeSelect
              mapId={mapId}
              universeSystemId={system.systemId}
              value={draftTypeId}
              onValueChange={setDraftTypeId}
            />
          ) : draftGroupKey === null ? (
            <Input className="h-8" placeholder="Pick a group first" disabled />
          ) : (
            <SiteTypeCombobox
              security={system.security}
              groupKey={draftGroupKey}
              value={draftName || null}
              onValueChange={(next) => setDraftName(next ?? '')}
            />
          )}
        </div>
        {draftGroupKey === 'wormhole' && (
          <div className="flex w-44 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Leads to</span>
            <ConnectionSelect
              system={system}
              connections={connections}
              systems={systems}
              value={draftConnectionId}
              onValueChange={setDraftConnectionId}
              targetClass={
                draftTypeId == null ? null : metaByTypeId.get(draftTypeId)?.targetClass ?? null
              }
              excludeIds={assignedConnectionIds}
            />
          </div>
        )}
        <Button type="button" onClick={submit} disabled={draftSigId.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Row Type cell, cascaded on Group:
 *   - `wormhole` → `WormholeTypeSelect` (writes `typeId`; mirrors the WH code to `name`).
 *   - cosmic groups (Combat/Relic/Data/Gas/Ore/Ghost) → free-form site name input (writes `name`).
 *   - null group → disabled placeholder.
 */
function TypeCell({
  mapId,
  system,
  sig,
  onPatch,
  onSyncConnectionSize,
}: {
  mapId: string;
  system: MapSystemNode;
  sig: MapSignature;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onSyncConnectionSize: (typeId: number | null, connectionId: string | null) => void;
}) {
  if (sig.groupKey === null) {
    return (
      <div className="text-xs text-muted-foreground italic">Pick a group first</div>
    );
  }
  if (sig.groupKey === 'wormhole') {
    return (
      <WormholeTypeSelect
        mapId={mapId}
        universeSystemId={system.systemId}
        value={sig.typeId}
        onValueChange={(typeId) => {
          // Mirror the resolved WH code to `name` so the cell displays the
          // code even without a fresh load; loadMap re-derives it via the
          // `universe_wormhole` join (`wormholeCode`).
          onPatch(sig.id, { typeId, name: null });
          // Picking the type completes the inference when a connection is already linked.
          onSyncConnectionSize(typeId, sig.mapConnectionId);
        }}
      />
    );
  }
  // Cosmic site name: class+group-filtered suggestions with free-text fallback.
  return (
    <SiteTypeCombobox
      security={system.security}
      groupKey={sig.groupKey}
      value={sig.name}
      onValueChange={(next) => onPatch(sig.id, { name: next })}
    />
  );
}

/**
 * Controlled text input that commits on blur. Keeps a local draft so each
 * keystroke isn't a PATCH, and re-syncs from `value` when the input isn't
 * focused (so external updates — optimistic apply, realtime — don't clobber
 * mid-edit typing).
 */
function EditableTextCell({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const next = draft.trim();
        if (next !== draft) setDraft(next);
        if (value !== next) onCommit(next);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}
