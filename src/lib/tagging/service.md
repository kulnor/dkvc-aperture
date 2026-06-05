## service.ts

**Purpose:** The db-aware seam between the map mutation pathways and the pure tagging strategies — builds a `TagContext` and dispatches to the registered strategy. No `'server-only'` guard (imported by `locationCommit.ts` under plain Node).
**File:** `src/lib/tagging/service.ts`

---

### loadTagContext(exec: Tx | db, mapId: bigint): Promise<TagContext | null>
Reads the map's `tag_scheme` + `home_map_system_id` + `exempt_home_static_from_tag`; returns `null` when the scheme is `none` (the caller then does no tagging work). Otherwise loads visible systems (joined to `universe_system.security` for WH class) and all connections (with their `is_static` flag). `exec` may be a transaction (add path, to see the just-inserted row) or the pool handle (connect path).

### assignTagOnAdd(tx: Tx, mapId: bigint, mapSystemId: bigint): Promise<void>
Runs inside the add transaction, **before** `buildSystemNode`, so the tag is in the `system.added` payload. Excludes the subject's own current tag from the computation (so a re-add can reclaim its old slot) and writes the strategy verdict verbatim — including `null`, which clears a tag preserved by the `(map_id, system_id)` upsert on re-add. No-op when no scheme is active.

### assignTagOnConnect(mapId, sourceMapSystemId, targetMapSystemId): Promise<{ mapSystemId; tag } | null>
Read-only: computes the tag a just-connected untagged system should receive (0121), or `null` (ABC / no scheme / no valid parent-child split). The caller emits the `system.updated` event that writes it, preserving "one mutation = one event".

### reconcileHomeStaticExemption(mapId: bigint): Promise<{ mapSystemId; tag: string | null }[]>
Read-only db wrapper for the ABC home-static exemption: loads the tag snapshot via `loadTagContext` and delegates to the pure `homeStaticExemptionChanges` (`abc.ts`). Returns the tag changes (exempt Home-static target → `tag: null`; other taggable holes → lowest free letter), or `[]` for 0121 / unscheme'd maps. The caller (`applyHomeStaticExemption` in `exemption.ts`) commits each change as its own `system.update` event.
