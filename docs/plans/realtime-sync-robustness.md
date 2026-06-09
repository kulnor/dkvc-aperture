# Realtime Sync Robustness

**Goal:** Close the two dropped-event gaps in the map realtime pathway so a client never silently diverges — (1) bursts can't be coalesced away on the client, and (2) a reconnecting client recovers what it missed while disconnected.

**Context references:**
- CLAUDE.md §"Realtime" (broadcast-only WS, degraded banner must never render silently stale).
- Soak harness + companion: `tests/integration/realtime-soak.test.ts`, `tests/integration/realtime-soak.md`.

---

## Background — what was found (investigation, already done)

The commit→fanout chain is sound and convergent under concurrency:
`updateSystem` → `commitMapEvent` (one `ap_map_event`) → `tg_map_event_notify` (`pg_notify`) → LISTEN bus (single connection, **commit-ordered**) → WS fan-out. The delta payload model means a move is `{ id, positionX, positionY }`, never a full-map push, so concurrent edits can't clobber via stale snapshots. The soak proves convergence + zero transport drop even at 960 contended commits.

Two gaps remain, both about **dropped-event recovery**, both above the socket:

1. **Client-layer burst coalescing.** `RealtimeProvider` stores the most recent envelope in a single `useState` (`src/lib/realtime/useRealtime.tsx:45,79`); every consumer reads it back through a `useEffect`. React batches state updates within a tick, so **when two or more envelopes are delivered before the effect commits, the state coalesces to the last one and every intermediate envelope is silently dropped** — even though the socket delivered all of them. Raw-`ws` transport does not coalesce, so the soak can't catch this; it needs its own test.

2. **No reconnect backfill.** On a dropped socket the SharedWorker reconnects and *replays the subscription set* (`src/lib/realtime/sharedWorker.ts:69-74`) — it resumes **new** events only. Anything committed during the disconnect window is lost permanently; the banner warns but the canvas is never re-synced. `eventId` is a monotonic sequence (the ingredient for a fix) but is used today only for self-echo dedup.

The two stages are independent and should be run in separate sessions.

---

## Stage 1 — Client event delivery becomes a queue (closes gap #1)

**Mode:** Accept edits
**Goal:** Every envelope the worker delivers reaches the consumer exactly once, regardless of React render batching. Replace the single-slot `lastEvent` with a synchronous listener fan-out.
**Touches:** `src/lib/realtime/useRealtime.tsx`, `src/components/map/MapCanvas.tsx`, `src/components/map/MapPresenceContext.tsx`, `src/components/map/MapUnderglowBridge.tsx`, `src/components/sidebar/ConnectionMassLog.tsx` (+ companion `.md` for each), new `tests/unit/realtime-delivery.test.tsx` (+ `.md`).

### The bug this closes (confirmed by code inspection + dev data)

**Reported symptom:** a tracked pilot jumps a freshly-discovered wormhole; the destination **system** appears on the map but the **connection** between it and the source system does not — two systems sit next to each other with no link. A browser **refresh fixes it**. Intermittent. Observed across several jumps (e.g. C5→0.0, C4→C3, C3→C4; concrete cases on dev map 7: `31002187 → 30002946`, `31001663 → 31001040`).

**Root cause.** A real wormhole jump fans out **three** envelopes back-to-back from the poll (see `src/lib/jobs/tasks/locationPoll.ts` steps 7–8 and `src/lib/jobs/locationCommit.ts`):

1. `system.added` (destination) — `task: 'mapUpdate'`
2. `connection.create` (source→destination) — `task: 'mapUpdate'`
3. `characterUpdate` (presence badge lands on the new node) — `task: 'characterUpdate'`

When **`connection.create` and the trailing `characterUpdate` arrive in the same React batch**, `lastEvent` jumps straight to `characterUpdate`. The canvas effect (`MapCanvas.tsx:344`) runs once, sees `task !== 'mapUpdate'`, and returns — **`connection.create` is never applied.** `system.added` was applied a tick earlier, so the system stays; the edge is gone.

Why this matches every observation:
- **New system shows, no connection** — `connection.create` is the swallowed event; `system.added` survived.
- **Intermittent** — depends on whether deliveries coalesce into one batch (buffered WS frames forwarded by the SharedWorker).
- **Only a refresh fixes it** — the dropped envelope is gone forever; reload rebuilds `viewData` from the authoritative DB snapshot (`GET /api/map/[mapId]` → `loadMapForView`), which has the connection.
- **`connectionCreated: true` server-side** — the event *was* emitted; it died in the client. Confirmed in `ap_job_run.notes` folds and `ap_map_event` rows on dev.

### Blast radius — every consumer reads `lastEvent` the same way

| File | Envelope task | Symptom of a dropped event |
|---|---|---|
| `src/components/map/MapCanvas.tsx:340-351` | `mapUpdate` | **the reported bug** — missing connection / system / signature mutation |
| `src/components/map/MapPresenceContext.tsx:233-239` | `characterUpdate` | pilot presence skips / stale location badge |
| `src/components/map/MapUnderglowBridge.tsx:30-42` | `systemNotification` | dropped kill/ping glow — **the comment at line 19 already documents this limitation** |
| `src/components/sidebar/ConnectionMassLog.tsx:51-65` | `connectionMassLog` | missing mass-log row |

`RealtimeStatusBanner.tsx` only reads `status` — unaffected.

### Approach (already agreed — mechanical)

Convert the façade from a **latest-value state** to an **event-emitter** that delivers every envelope exactly once, synchronously, outside React's batched state path.

`src/lib/realtime/useRealtime.tsx`:
- Add a listener registry: `const listenersRef = useRef<Set<(env: Envelope) => void>>(new Set())`.
- In `port.onmessage` (envelope branch), after a successful parse, invoke every listener synchronously: `for (const l of listenersRef.current) l(result.data)`. Do **not** route map/presence/etc. events through React state.
- Expose a **stable** `subscribeToEvents(listener): () => void` via `useCallback([], …)`.
- **Remove `lastEvent`** from the context type and value, so the context value only changes when `status` changes (consumers no longer re-render per envelope). `status` stays `useState` (drives the banner).
- Add a hook:
  ```ts
  export function useRealtimeEvents(listener: (env: Envelope) => void): void {
    const { subscribeToEvents } = useRealtime();
    const ref = useRef(listener);
    ref.current = listener; // keep latest without re-subscribing each render
    useEffect(() => subscribeToEvents((env) => ref.current(env)), [subscribeToEvents]);
  }
  ```

Migrate **all four** consumers: replace each `useEffect(… [lastEvent])` with `useRealtimeEvents((envelope) => { … })`, keeping the exact same task-filter + parse + reducer/store-update body. Example (`MapCanvas`):

```ts
useRealtimeEvents(
  useCallback((envelope: Envelope) => {
    if (envelope.task !== 'mapUpdate') return;
    const loadResult = mapUpdateLoadSchema.safeParse(envelope.load);
    if (!loadResult.success || !loadResult.data.data) return;
    const payload = loadResult.data.data;
    if (appliedEventIds.current.has(payload.eventId)) return;
    appliedEventIds.current.add(payload.eventId);
    setViewData((prev) => applyEvent(prev, payload));
  }, []),
);
```

Delete the now-obsolete "only the latest `lastEvent`" comment in `MapUnderglowBridge.tsx`.

**Why this is correct:** each consumer's handler ends in a *functional* state update (`setViewData(prev => applyEvent(prev, payload))`) or a ref/store mutation. Functional updates **compose**, so N envelopes delivered in one tick now apply all N in order instead of only the last. Self-echo dedup (via `appliedEventIds`) is unchanged.

### Test (the assertion the gap currently fails)

- jsdom: stub `globalThis.SharedWorker` with a fake exposing the port; render `RealtimeProvider` wrapping a probe component that registers `useRealtimeEvents(push → received[])`. Fire N `message` events on the port **within a single tick** (no `await` between them). Assert `received.length === N` and order preserved. The old single-slot implementation drops to `1`; the queue implementation passes.

**Done when:** the new delivery test passes, `pnpm typecheck` + `pnpm lint` are clean, and `RUN_DB_TESTS=1 pnpm test realtime-soak` still green (no regression to the transport path).

---

## Stage 2 — Reconnect resync (closes gap #2)

**Mode:** Plan mode
**Goal:** When a client's socket reconnects after having been disconnected, the canvas converges to the authoritative DB state instead of silently missing the gap.
**Touches (depends on the decision below):** `src/lib/realtime/useRealtime.tsx`, `src/components/map/MapCanvas.tsx`, possibly `src/lib/realtime/sharedWorker.ts`, possibly a new `src/app/api/map/[mapId]/snapshot/route.ts` **or** `.../events/route.ts`, `src/lib/map/loadMap.ts`, `src/types/index.ts`, tests. All with companion `.md` updates.

**Key decision to settle first (this is why the stage is Plan mode):**

| Approach | Mechanism | Trade-off |
|---|---|---|
| **A. Snapshot refetch on reconnect (recommended)** | On reconnect, refetch the full `MapViewData` and reset `viewData` + the dedup set. New `GET /api/map/[mapId]/snapshot` returning `loadMapForView` JSON (or `router.refresh()` + reset `viewData` from the new `data` prop). | Guaranteed correct (DB row is truth); simplest; no ordering hazard. One extra fetch per reconnect — and reconnects are rare. |
| **B. Backfill "since eventId"** | Track a per-map high-watermark `lastEventId` (seed from a new `MapViewData.lastEventId` at page load; advance on every applied event). On reconnect, `GET /api/map/[mapId]/events?since=N` returns payloads with `id > N` ascending; fold each through `applyEvent` (dedup via `appliedEventIds`); on a gap larger than a cap (e.g. 1000) return `{ truncated: true }` and fall back to a full reload. | Preserves the activity feed and avoids a full snapshot, but `ap_map_event.id` order ≠ commit order, so replaying contended same-row edits in id order can land a different last-writer than the DB. Needs the truncation fallback anyway. More moving parts. |

Recommendation: **A**. It's smaller, has no LWW-ordering hazard, and reconnects are infrequent. Reserve B only if an explicit need to avoid full refetch surfaces.

**Reconnect trigger (both approaches):** detect the `status` transition into `'open'` from a previously non-open state. `status` already lives in `RealtimeProvider`; in `MapCanvas`, `useEffect` on `status` with a `wasDisconnectedRef` so the **initial** mount-open does NOT trigger a resync (the page-load snapshot is already fresh) — only an open that follows a `closed`/`degraded` does. No new worker→port plumbing is required if `status` is reused; only add a worker signal if Plan-mode review finds `status` insufficient.

**Backend (approach A):** `GET /api/map/[mapId]/snapshot` — `requireMapView(rawMapId, session)` guard (mirror `src/app/api/map/[mapId]/wormhole-types/route.ts`), return `{ ok: true, data: <MapViewData> }` from `loadMapForView`. Existence is never leaked: missing/non-viewable → 404.

**Tests:**
- Client (jsdom, mock `SharedWorker` + mock `fetch`): drive `status` `open → degraded → open`; assert a snapshot fetch fires only on the *second* open and that `viewData` is reset from the response. Assert the initial open does **not** fetch.
- Flip the soak's intent at the **real-client** layer, not the raw-`ws` observer: the soak's reconnect test (`tests/integration/realtime-soak.test.ts`, test #3) stays as-is — it documents the *transport* has no backfill, which remains true. Add a note in `realtime-soak.md` pointing to the new client-level reconnect test as the place that proves end-to-end recovery.

**Done when:** the client reconnect test passes (resync on reconnect, no fetch on first open), `pnpm typecheck`/`pnpm lint` clean, and the soak suite still green. The degraded banner behaviour (Stage 1 unaffected) still shows during the disconnect and clears on recovery.

---

## Investigation dead-ends (do not re-tread)

1. **"Re-add of a soft-removed system" theory** — that the fold re-shows a hidden system whose connection row still exists, suppressing `connection.create`. *Disproven:* the reported jumps had `connectionCreated: true` and emitted a valid `connection.create`. (A separate, milder reconciliation gap exists there, but it is **not** this bug.)
2. **xyflow node/edge render race** — that xyflow drops an edge whose freshly-added node isn't measured yet and never re-derives it. *Disproven by reproduction:* driving the real fold (`system.added` + `connection.create` ~7–15 ms apart) 40× locally **always** rendered the edge. `ConnectionEdge` (`src/components/map/ConnectionEdge.tsx:98-124`) also falls back to xyflow geometry for unmeasured nodes and never returns null. The edge was never missing because xyflow dropped it — it was missing because the **event never reached `applyEvent`**.
3. An earlier speculative edit to the `MapCanvas` edges `useMemo` (filter + key on `viewData.systems`) was made under theory #2 and **reverted** — it does not address the real cause.

---

## Notes for whoever runs this

- Start each stage in a fresh session; open this file and read the stage first.
- Stage 1 is mechanical → Accept edits. Stage 2 has a real design fork (A vs B) → Plan mode; confirm the approach before writing files.
- Standing instruction applies: every `.ts`/`.tsx` you touch gets its companion `.md` updated in the same change.
- The soak harness is the regression guard for the transport layer; the two new tests guard the client layer. Run `RUN_DB_TESTS=1 pnpm test realtime-soak` (Postgres up via `docker compose`) after each stage.
