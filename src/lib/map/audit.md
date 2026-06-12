## audit.ts

**Purpose:** Read layer for the manager audit console — turns the append-only `ap_map_event` log into a filtered, keyset-paginated, human-rendered commit feed for one map.
**File:** `src/lib/map/audit.ts`

Reuses `describeMapEvent` (`src/lib/webhooks/formatters.ts`) so a commit reads identically in the audit table and the Discord history webhook, and resolves the naming context for a whole *page* of events in a fixed number of batched queries (vs. the dispatcher's per-event joins). `import 'server-only'` — used only by the API route + admin page, never the job runner.

---

### loadAuditMap(mapId, scope): Promise<{ id, name } | null>
Confirms the map is within the manager's `AdminVisibilityScope` (via `mapScopeFilterFor`) and returns its display name. **Includes soft-deleted maps** (no `deletedAt` filter) so a manager can audit why a map was deleted. `null` → caller 404s.

---

### listAuditActors(mapId): Promise<AuditActor[]>
Distinct actors who have committed to the map, with event counts and account-main rollup (`ap_character.user_id → ap_user.main_character_id → main character name`, via a self-alias). Includes the `characterId: null` automation bucket (named "System / automation"). Sorted by event count desc.

---

### queryAuditEvents(params: AuditQueryParams): Promise<AuditPage>
Keyset-paginated feed, newest first. Pages back through time via an opaque base64url `cursor` encoding the last `(occurred_at, id)`, riding the `(map_id, occurred_at DESC)` index. Filters: `characterId` (a bigint, `'none'` for automation, or omit for all), `kinds`, `from`/`to` (`occurred_at` window — also prunes partitions), and `q` (best-effort substring `ILIKE` over actor name, kind, and `payload ->> sigId|name|alias|tag`). Position-only `system.updated` drags are excluded at the DB (`jsonb_exists`/`jsonb_exists_any`) so paging stays dense.

After fetching `limit + 1` rows it batch-resolves every referenced system name and connection endpoint in two queries, then renders each row's `summary` with `describeMapEvent` (falling back to local phrasing for the admin-only `map.restore` / `map.purge`). `limit` defaults to 50, capped at 100. Returns `{ rows, nextCursor }`; `nextCursor` is `null` when the last page is reached.

---

### auditActorSummary(mapId, characterId, from?, to?): Promise<ActorSummary>
Cheap `COUNT(*) GROUP BY kind` aggregate for the drill-down header: per-category counts, total, and a highlighted destructive count (`system.removed`, `connection.delete`, `signature.delete`, `map.delete`, `map.purge`). `characterId` is a bigint or `'none'`. Applies the same position-only exclusion + date window as the feed so the numbers match.

---

### Types
- `AuditEventCategory` — `'system' | 'connection' | 'signature' | 'map'` (derived from the kind prefix).
- `AuditEventRow` — `{ id, occurredAt, kind, category, characterId, characterName, summary, destructive }` (ids as strings).
- `AuditActor` — `{ characterId, name, mainCharacterId, mainName, eventCount }`; `characterId: null` = automation.
- `ActorSummary` — `{ total, destructive, byCategory }`.
- `AuditQueryParams` — `{ mapId, characterId?, kinds?, from?, to?, q?, cursor?, limit? }`.
- `AuditPage` — `{ rows, nextCursor }`.
