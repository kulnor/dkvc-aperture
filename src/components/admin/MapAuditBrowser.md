## MapAuditBrowser

**Purpose:** Interactive client surface of the manager audit console — a filtered, keyset-paginated commit feed for one map.
**File:** `src/components/admin/MapAuditBrowser.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | The map whose `ap_map_event` history to browse |
| actors | AuditActor[] | yes | Distinct actors (server-loaded) for the actor filter dropdown |

### Renders
A toolbar (actor dropdown, category toggles, "Deletions only" + "Last 24h" chips, date-range inputs, debounced search box, Clear), an optional per-actor summary bar (when a single actor is selected), and a table of commits (When / Actor / Action badge / Detail) with a "Load more" footer.

### Behaviour & Interactions
- Fetches `/api/map/[mapId]/audit` with the current filters; **any filter change refetches the first page**, "Load more" appends the next keyset page via `nextCursor`.
- Search is debounced 250ms; in-flight requests are aborted via `AbortController` so stale responses can't overwrite newer ones.
- Clicking a row's actor sets the actor filter to that character (drill-down); the automation bucket filters to `characterId=none`.
- Category toggles + "Deletions only" are translated client-side into the `kinds` query param (`computeKinds`); no narrowing → param omitted.
- Destructive kinds (`*.removed`/`*.delete`/`map.purge`) render with a `text-destructive` badge; the actor summary highlights the destructive count.
- Time shows as relative (`5m ago`) with the absolute timestamp on hover.

### Local State
- `actor` (`'all' | 'none' | <id>`), `categories` (Set), `destructiveOnly`, `fromDate`/`toDate`, `qInput`/`q` (debounced) — the filters.
- `rows`, `nextCursor`, `actorSummary`, `loading`, `error` — the fetched feed.

### Depends On
- `ccpImageUrl` (`src/lib/integrations/links.ts`) — actor portraits.
- Types `AuditActor` / `AuditEventRow` / `AuditEventCategory` / `ActorSummary` / `MapEventKind` from `@/types` (type-only; the kind vocabulary is mirrored locally to keep the server schema out of the client bundle).
