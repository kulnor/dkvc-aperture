# Pathfinder Statistics Import

**Goal:** A reusable, operator-run importer that lands years of weekly/monthly/yearly created/updated/deleted activity from a legacy Pathfinder (MariaDB) instance into Aperture's Statistics dialog, attributed per main character. Run once per migrating corp; corp id / owner / PF source are inputs, not hardcoded.

**Scope note:** Aperture's Statistics dialog is *scope-wide* (private/corp/alliance), not per-map — `loadActivityStats` sums across every viewable map of the selected scope. So this importer does not produce per-map stat lines; it folds legacy counts into the corp tab's totals alongside live maps. The synthetic `ap_map` exists only to satisfy the reader's FK and corp-scope filter.

**References:**
- `src/lib/stats/activity.md` / `.ts` — the reader (`loadActivityStats`); the UNION point is its raw query.
- `src/db/views/activity_rollup.md` — the materialized view whose grain we mirror.
- `src/db/schema/ap/map_event.md`, `event_kind.md`, `map.md`, `character.md`, `user.md` — target shapes.
- CLAUDE.md: hand-written migrations since 0011; companion `.md` updated in the same edit; "history lives in `ap_map_event`" (we add a clearly-labelled, count-only *import* table rather than synthesising fake events — recorded deviation, see below).

## Decisions already made

- **Target = an import table at the rollup grain, UNION'd into the reader.** Not synthesised `ap_map_event` rows: Pathfinder stores *counts*, not events, so faking events would only force the MV to re-count them, and would require pre-creating historical partitions and suppressing the notify trigger.
- **Identity = real placeholder rows.** Per run: one active corp `ap_map`, one shared "Legacy Import" `ap_user` (NULL main), and a placeholder `ap_character` for each main absent from Aperture. Names resolve and per-main merge happens automatically via the reader's existing `COALESCE(u.main_character_id, c.id, r.character_id)`.
- **Reusable, parameterized per corp.** Corp id / owner principal, the synthetic map name, and the PF source (dump path) are CLI inputs. If the PF instance has multiple maps, **collapse them into one synthetic corp map** — stats are scope-wide, so per-PF-map separation buys nothing. Still an operator-run script, not a self-serve UI.
- **Collapse alts → main in the ETL.** Aperture's `ap_user.main_character_id` is authoritative for anyone present in Aperture; PF-only accounts use their `user_character` grouping with a most-active (then `lastLogin`) heuristic to pick the representative main (label only — all alt counts still merge).

### Column mapping (`activity_log` → `kind`)
`systemCreate/Update/Delete` → `system.added/updated/removed`; `connectionCreate/Update/Delete` → `connection.create/update/delete`; `signatureCreate/Update/Delete` → `signature.create/update/delete`. `map*` columns dropped (reader filters `kind LIKE 'map.%'`). Filter `activity_log.active = 1`; NULL `characterId` → `0`.

### Known caveats
- PF `character.id` is `int(11)` (signed 32-bit) — EVE ids > 2,147,483,647 are already truncated in PF. Such alts (rare; usually throwaways whose main is an older sub-2.1B char) are unmappable and fall to the `0` bucket.
- Attribution for mains *present in Aperture* tracks future main reassignments (resolved at read time); PF-only mains are frozen to the ETL's heuristic pick.

---

## Stage 0 — Pre-flight: confirm PF week semantics + extract data
**Mode:** Plan mode
**Goal:** Determine whether `activity_log.year` is ISO year (PHP `date('o')`) or calendar year (`date('Y')`), and pull the three source tables.
**Touches:** read-only against MariaDB.
**Done when:**
- We know the year semantics. Spot-check: `SELECT year, week, MIN(created), MAX(created) FROM activity_log WHERE week IN (1,52,53) GROUP BY year, week ORDER BY year, week;` — if a `week=1` group's dates straddle a Jan/Dec boundary with the *ISO* year, PF used `date('o')` and a direct `(year, week)` copy is correct; otherwise the ETL must recompute ISO year from a representative date. The reader resolves `(year, week)` via `to_date(year||'-'||week,'IYYY-IW')`, which requires ISO year.
- Dumps of `activity_log` (active=1), `character` (id, name, ownerHash, corporationId, allianceId, lastLogin), and `user_character` (userId, characterId) are available to the ETL (CSV/JSON — avoids adding a MariaDB driver to app deps).

## Stage 1 — Migration: `ap_activity_rollup_import`
**Mode:** Accept edits
**Goal:** Create the import table.
**Touches:** `src/db/migrations/00NN_activity_rollup_import.sql` (+ `.rollback.sql`, journal entry), `src/db/schema/ap/activity_rollup_import.ts` (+ companion `.md`), `src/db/schema/index.ts`, `src/db/schema.md`.
**Shape:** `(iso_year int, iso_week int, character_id bigint, map_id bigint, kind text, event_count int, PRIMARY KEY (iso_year, iso_week, character_id, map_id, kind))`. FK `map_id` → `ap_map.id` ON DELETE CASCADE. **No** FK on `character_id` (carries the `0` sentinel, mirroring the MV).
**Done when:** migration applies cleanly against the dev DB and `pnpm typecheck`/`build` pass.

## Stage 2 — ETL script
**Mode:** Plan mode → Accept edits
**Goal:** A reusable, idempotent, operator-run loader: `scripts/import-pathfinder-stats.ts`.
**Touches:** `scripts/import-pathfinder-stats.ts` (+ companion `.md`). Uses the existing Postgres pool; reads the Stage-0 dumps from disk.
**Inputs (CLI flags / config):** corp id, owner principal kind (`corporation`/`alliance`) + id, synthetic map name, PF dump paths. No hardcoded corp constants.
**Steps:**
1. Build `characterId → mainId`: if the PF character exists in `ap_character`, use its `ap_user.main_character_id`; else group by PF `user_character.userId` and pick the most-active char (sum of that account's `activity_log` counts; tie-break newest `lastLogin`).
2. Seed (idempotent — look up before insert so re-runs and repeat corps don't duplicate): one `ap_map` (`type` from owner kind, owner column set from the input, `deleted_at` NULL, name from input); one shared `ap_user` (Legacy Import, NULL main); a placeholder `ap_character` (id, user_id=legacy, name, owner_hash, corp/alliance) for each main not already in `ap_character`.
3. **Collapse all PF maps into the one synthetic map** (ignore PF `mapId` beyond filtering, since stats are scope-wide). Unpivot `activity_log` → 9 kinds, re-key `characterId → mainId` (NULL/unmappable → `0`), sum per `(iso_year, iso_week, mainId, kind)`, `INSERT … ON CONFLICT … DO UPDATE` into the import table (re-runnable).
**Done when:** the import table is populated and per-kind totals reconcile against `SELECT SUM(systemCreate) …` from PF for a sampled set of weeks/characters, and a dry second run is a no-op (no duplicate seed rows, counts unchanged).

## Stage 3 — Reader: UNION the import table
**Mode:** Accept edits
**Goal:** Surface legacy data in the Statistics dialog, merged with live data by main.
**Touches:** `src/lib/stats/activity.ts` (+ `activity.md`); note the import source in `src/db/views/activity_rollup.md`.
**Change:** in `loadActivityStats`, replace `FROM ap_activity_rollup r` with `FROM (SELECT iso_year, iso_week, character_id, map_id, kind, event_count FROM ap_activity_rollup UNION ALL SELECT iso_year, iso_week, character_id, map_id, kind, event_count FROM ap_activity_rollup_import) r`. Nothing else changes — scoping, main `COALESCE`, name resolution and bucketing all flow through.
**Done when:** the Statistics dialog shows a known main's historical + live counts merged into one row with the correct name/portrait; spot-checked totals match PF; `pnpm lint`/`typecheck`/`build` pass.

## Stage 4 — Reconciliation
**Mode:** Plan mode
**Goal:** Confirm fidelity and document residuals.
**Done when:** corp-scope weekly/monthly/yearly totals match PF within the documented caveats (int32 truncation, `system.moved` exclusion of drag-only repositions), and any residual delta is written down.
