import 'server-only';
import { and, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSystem,
  apUser,
  universeSystem,
} from '@/db/schema';
import { mapScopeFilterFor, type AdminVisibilityScope } from '@/lib/auth/rights';
import {
  mapEventPayloadSchema,
  type MapEventKind,
  type MapEventPayload,
} from '@/lib/realtime/protocol';
import { describeMapEvent, type WebhookEventContext } from '@/lib/webhooks/formatters';

/**
 * Read layer for the manager audit console (`/admin/maps/[mapId]/audit`).
 *
 * Every map mutation already lands as one `ap_map_event` row; this module is the
 * only read path that turns that append-only log into a human-browsable feed.
 * It reuses `describeMapEvent` (the same renderer the Discord history webhook
 * uses) so a commit reads identically on both surfaces, and it resolves the
 * naming context for a whole *page* of events in a fixed number of queries
 * rather than the dispatcher's one-event-at-a-time joins.
 */

export type AuditEventCategory = 'system' | 'connection' | 'signature' | 'map';

/** One rendered commit for the audit table. Ids cross the wire as strings (bigint). */
export interface AuditEventRow {
  id: string;
  occurredAt: string;
  kind: MapEventKind;
  category: AuditEventCategory;
  /** Acting character id; `null` for job-driven / automation events. */
  characterId: string | null;
  characterName: string | null;
  /** Human one-liner ("Koro set Jita status → friendly"). Never null in a row. */
  summary: string;
  /** A destroy-shaped action (system/connection/signature removal, map delete/purge). */
  destructive: boolean;
}

/** A distinct actor on a map, for the filter dropdown. `characterId: null` = automation. */
export interface AuditActor {
  characterId: string | null;
  name: string;
  mainCharacterId: string | null;
  mainName: string | null;
  eventCount: number;
}

/** Per-actor aggregate for the drill-down header. */
export interface ActorSummary {
  total: number;
  destructive: number;
  byCategory: Record<AuditEventCategory, number>;
}

export interface AuditQueryParams {
  mapId: bigint;
  /** A specific character, `'none'` for the automation bucket, or omit for all actors. */
  characterId?: bigint | 'none';
  kinds?: MapEventKind[];
  from?: Date;
  to?: Date;
  /** Best-effort substring search over actor name, kind, and a few payload fields. */
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export interface AuditPage {
  rows: AuditEventRow[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const DESTRUCTIVE_KINDS: ReadonlySet<MapEventKind> = new Set([
  'system.removed',
  'connection.delete',
  'signature.delete',
  'map.delete',
  'map.purge',
]);

/**
 * Drop position-only `system.updated` rows (pure canvas drags) at the DB so paging
 * stays dense — these are the rows `describeMapEvent` returns `null` for. A drag
 * patch carries `positionX` but none of the meaningful fields; uses the underlying
 * `jsonb_exists*` functions to avoid the `?`/`?|` operators (driver placeholder
 * ambiguity). Null payloads on non-`system.updated` rows are unaffected.
 */
const excludePositionOnly: SQL = sql`not (${apMapEvent.kind} = 'system.updated' and jsonb_exists(${apMapEvent.payload}, 'positionX') and not jsonb_exists_any(${apMapEvent.payload}, array['status','alias','tag','intelNotes','locked','rallyAt']))`;

function kindCategory(kind: MapEventKind): AuditEventCategory {
  // Every MapEventKind is `<category>.<verb>`; the prefix is one of the four.
  return kind.slice(0, kind.indexOf('.')) as AuditEventCategory;
}

function safeBigInt(value: string | null | undefined): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function encodeCursor(occurredAt: Date, id: bigint): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id.toString()}`).toString('base64url');
}

function decodeCursor(cursor: string): { occurredAt: Date; id: bigint } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep < 0) return null;
    const occurredAt = new Date(raw.slice(0, sep));
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id: BigInt(raw.slice(sep + 1)) };
  } catch {
    return null;
  }
}

/**
 * Confirm the map is within the manager's admin scope and return its display name.
 * Soft-deleted maps are intentionally included — a manager auditing *why* a map
 * was deleted still needs to reach its history. Returns `null` → caller 404s.
 */
export async function loadAuditMap(
  mapId: bigint,
  scope: AdminVisibilityScope,
): Promise<{ id: bigint; name: string } | null> {
  const scopeFilter = mapScopeFilterFor(scope);
  const where = scopeFilter ? and(eq(apMap.id, mapId), scopeFilter) : eq(apMap.id, mapId);
  const [row] = await db.select({ id: apMap.id, name: apMap.name }).from(apMap).where(where);
  return row ?? null;
}

/**
 * Distinct actors who have ever committed to this map, with their event counts and
 * account-main rollup (so the dropdown can show "Alt (main: Main)"). Includes the
 * `characterId: null` automation bucket when present.
 */
export async function listAuditActors(mapId: bigint): Promise<AuditActor[]> {
  const mainChar = alias(apCharacter, 'audit_main_char');
  const rows = await db
    .select({
      characterId: apMapEvent.characterId,
      name: apCharacter.name,
      mainCharacterId: apUser.mainCharacterId,
      mainName: mainChar.name,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(apMapEvent)
    .leftJoin(apCharacter, eq(apMapEvent.characterId, apCharacter.id))
    .leftJoin(apUser, eq(apCharacter.userId, apUser.id))
    .leftJoin(mainChar, eq(apUser.mainCharacterId, mainChar.id))
    .where(eq(apMapEvent.mapId, mapId))
    .groupBy(apMapEvent.characterId, apCharacter.name, apUser.mainCharacterId, mainChar.name);

  return rows
    .map((r) => ({
      characterId: r.characterId?.toString() ?? null,
      name: r.name ?? 'System / automation',
      mainCharacterId: r.mainCharacterId?.toString() ?? null,
      mainName: r.mainName ?? null,
      eventCount: r.eventCount,
    }))
    .sort((a, b) => b.eventCount - a.eventCount);
}

/** Shared filter clauses (everything except the keyset cursor). */
function filterClauses(params: AuditQueryParams): SQL[] {
  const clauses: SQL[] = [eq(apMapEvent.mapId, params.mapId), excludePositionOnly];
  if (params.characterId === 'none') {
    clauses.push(isNull(apMapEvent.characterId));
  } else if (params.characterId !== undefined) {
    clauses.push(eq(apMapEvent.characterId, params.characterId));
  }
  if (params.kinds && params.kinds.length > 0) {
    clauses.push(inArray(apMapEvent.kind, params.kinds));
  }
  if (params.from) clauses.push(gte(apMapEvent.occurredAt, params.from));
  if (params.to) clauses.push(lte(apMapEvent.occurredAt, params.to));
  if (params.q && params.q.trim().length > 0) {
    const pat = `%${params.q.trim()}%`;
    clauses.push(
      or(
        ilike(apCharacter.name, pat),
        ilike(apMapEvent.kind, pat),
        sql`(${apMapEvent.payload} ->> 'sigId') ilike ${pat}`,
        sql`(${apMapEvent.payload} ->> 'name') ilike ${pat}`,
        sql`(${apMapEvent.payload} ->> 'alias') ilike ${pat}`,
        sql`(${apMapEvent.payload} ->> 'tag') ilike ${pat}`,
      )!,
    );
  }
  return clauses;
}

/**
 * Keyset-paginated audit feed for one map, newest first. Pages back through time
 * via an opaque `cursor` (encodes the last `(occurred_at, id)`), riding the
 * `(map_id, occurred_at DESC)` index. After fetching a page it resolves every
 * referenced system / connection-endpoint name in two batched queries, then renders
 * each row's human summary with the shared `describeMapEvent`.
 */
export async function queryAuditEvents(params: AuditQueryParams): Promise<AuditPage> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const clauses = filterClauses(params);

  if (params.cursor) {
    const c = decodeCursor(params.cursor);
    if (c) {
      clauses.push(
        or(
          lt(apMapEvent.occurredAt, c.occurredAt),
          and(eq(apMapEvent.occurredAt, c.occurredAt), lt(apMapEvent.id, c.id)),
        )!,
      );
    }
  }

  const fetched = await db
    .select({
      id: apMapEvent.id,
      occurredAt: apMapEvent.occurredAt,
      kind: apMapEvent.kind,
      payload: apMapEvent.payload,
      characterId: apMapEvent.characterId,
      characterName: apCharacter.name,
    })
    .from(apMapEvent)
    .leftJoin(apCharacter, eq(apMapEvent.characterId, apCharacter.id))
    .where(and(...clauses))
    .orderBy(desc(apMapEvent.occurredAt), desc(apMapEvent.id))
    .limit(limit + 1);

  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;

  const names = await resolveNames(page.map((r) => r.payload));

  const rows: AuditEventRow[] = page.map((r) => {
    const kind = r.kind as MapEventKind;
    const who = r.characterName ?? 'Aperture';
    const parsed = mapEventPayloadSchema.safeParse(r.payload);
    let summary: string | null = null;
    if (parsed.success) {
      summary = describeMapEvent(parsed.data, buildContext(parsed.data, r.characterName, names), who);
    }
    return {
      id: r.id.toString(),
      occurredAt: r.occurredAt.toISOString(),
      kind,
      category: kindCategory(kind),
      characterId: r.characterId?.toString() ?? null,
      characterName: r.characterName,
      summary: summary ?? fallbackSummary(kind, who),
      destructive: DESTRUCTIVE_KINDS.has(kind),
    };
  });

  const last = page.at(-1);
  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
  };
}

interface ResolvedNames {
  systemNameByMapSystemId: Map<string, string>;
  endpointsByConnectionId: Map<string, { source: string | null; target: string | null }>;
}

/** Batch-resolve every system / connection-endpoint name referenced by a page of payloads. */
async function resolveNames(payloads: unknown[]): Promise<ResolvedNames> {
  const mapSystemIds = new Set<bigint>();
  const connectionIds = new Set<bigint>();

  for (const raw of payloads) {
    const parsed = mapEventPayloadSchema.safeParse(raw);
    if (!parsed.success) continue;
    const ev = parsed.data;
    switch (ev.kind) {
      case 'system.added':
      case 'system.removed':
      case 'system.updated':
        addId(mapSystemIds, ev.id);
        break;
      case 'signature.create':
        addId(mapSystemIds, ev.mapSystemId);
        break;
      case 'connection.create':
        addId(mapSystemIds, ev.source);
        addId(mapSystemIds, ev.target);
        break;
      case 'connection.update':
        addId(connectionIds, ev.id);
        break;
      default:
        break;
    }
  }

  const endpointsByConnectionId = new Map<
    string,
    { source: string | null; target: string | null }
  >();
  if (connectionIds.size > 0) {
    const rows = await db
      .select({
        id: apMapConnection.id,
        source: apMapConnection.sourceMapSystemId,
        target: apMapConnection.targetMapSystemId,
      })
      .from(apMapConnection)
      .where(inArray(apMapConnection.id, [...connectionIds]));
    for (const row of rows) {
      mapSystemIds.add(row.source);
      mapSystemIds.add(row.target);
      endpointsByConnectionId.set(row.id.toString(), {
        source: row.source.toString(),
        target: row.target.toString(),
      });
    }
  }

  const systemNameByMapSystemId = new Map<string, string>();
  if (mapSystemIds.size > 0) {
    const rows = await db
      .select({ mapSystemId: apMapSystem.id, name: universeSystem.name })
      .from(apMapSystem)
      .innerJoin(universeSystem, eq(apMapSystem.systemId, universeSystem.id))
      .where(inArray(apMapSystem.id, [...mapSystemIds]));
    for (const row of rows) {
      systemNameByMapSystemId.set(row.mapSystemId.toString(), row.name);
    }
  }

  return { systemNameByMapSystemId, endpointsByConnectionId };
}

function addId(set: Set<bigint>, value: string | null | undefined): void {
  const id = safeBigInt(value);
  if (id !== null) set.add(id);
}

/** Build the `describeMapEvent` naming context from the pre-resolved name maps. */
function buildContext(
  ev: MapEventPayload,
  characterName: string | null,
  names: ResolvedNames,
): WebhookEventContext {
  const nameOf = (value: string | null | undefined): string | null =>
    value ? (names.systemNameByMapSystemId.get(value) ?? null) : null;

  let systemName: string | null = null;
  let sourceSystemName: string | null = null;
  let targetSystemName: string | null = null;

  switch (ev.kind) {
    case 'system.added':
      systemName = ev.name;
      break;
    case 'system.removed':
    case 'system.updated':
      systemName = nameOf(ev.id);
      break;
    case 'signature.create':
      systemName = nameOf(ev.mapSystemId);
      break;
    case 'connection.create':
      sourceSystemName = nameOf(ev.source);
      targetSystemName = nameOf(ev.target);
      break;
    case 'connection.update': {
      const endpoints = names.endpointsByConnectionId.get(ev.id);
      sourceSystemName = nameOf(endpoints?.source);
      targetSystemName = nameOf(endpoints?.target);
      break;
    }
    default:
      break;
  }

  // `mapName` is unused by describeMapEvent (only the Discord prefix needs it).
  return { mapName: '', characterName, systemName, sourceSystemName, targetSystemName };
}

/** Phrasing for events `describeMapEvent` declines (admin map.restore / map.purge). */
function fallbackSummary(kind: MapEventKind, who: string): string {
  switch (kind) {
    case 'map.restore':
      return `${who} restored the map.`;
    case 'map.purge':
      return `${who} permanently purged the map.`;
    default:
      return `${who} made a change (${kind}).`;
  }
}

/**
 * Per-actor aggregate for the drill-down header: per-category counts, total, and a
 * highlighted destructive count. Honours the same position-only exclusion and
 * optional date window as the feed so the numbers match what the table shows.
 */
export async function auditActorSummary(
  mapId: bigint,
  characterId: bigint | 'none',
  from?: Date,
  to?: Date,
): Promise<ActorSummary> {
  const clauses: SQL[] = [eq(apMapEvent.mapId, mapId), excludePositionOnly];
  clauses.push(
    characterId === 'none' ? isNull(apMapEvent.characterId) : eq(apMapEvent.characterId, characterId),
  );
  if (from) clauses.push(gte(apMapEvent.occurredAt, from));
  if (to) clauses.push(lte(apMapEvent.occurredAt, to));

  const rows = await db
    .select({ kind: apMapEvent.kind, count: sql<number>`count(*)::int` })
    .from(apMapEvent)
    .where(and(...clauses))
    .groupBy(apMapEvent.kind);

  const byCategory: Record<AuditEventCategory, number> = {
    system: 0,
    connection: 0,
    signature: 0,
    map: 0,
  };
  let total = 0;
  let destructive = 0;
  for (const row of rows) {
    const kind = row.kind as MapEventKind;
    byCategory[kindCategory(kind)] += row.count;
    total += row.count;
    if (DESTRUCTIVE_KINDS.has(kind)) destructive += row.count;
  }
  return { total, destructive, byCategory };
}
