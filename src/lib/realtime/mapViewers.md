## mapViewers.ts

**Purpose:** Process-wide, `globalThis`-pinned roster of which *accounts* currently have each map open in a live WebSocket — the signal behind the pilot-roster "online but map not open" icon. Distinct from server-side location tracking, which runs whether or not a tab is open.
**File:** `src/lib/realtime/mapViewers.ts`

---

### addMapViewer(mapId: bigint, userId: number): void
Records one more live socket for account `userId` on `mapId` (refcounted). Called by `wsServer.ts` when a socket first subscribes to a map.

### removeMapViewer(mapId: bigint, userId: number): void
Drops one of account `userId`'s sockets on `mapId`; removes the account entirely at refcount zero. Called by `wsServer.ts` on unsubscribe and on socket close.

### getMapViewerUserIds(mapId: bigint): number[]
The account ids (`ap_user.id`) that currently have `mapId` open in a live socket. Two consumers:
- `GET /api/map/[mapId]/viewers` expands these to the character ids those accounts own.
- The **location-poll** (`src/lib/jobs/tasks/locationPoll.ts`) uses it as the presence gate for adding new systems: a tracked pilot's wormhole jump may add a system not already on the map only when the moving pilot's account id is in this list for that map (worker runs in-process beside the WS server, so the roster is directly readable). See `locationCommit.md`'s `addNewSystems` gate.

### Notes
- **Keyed by account, not character.** A session holds one active character but an account owns many, and location tracking is per-character — so one human can have several alts on the roster at once. If their account has the map open they can see *all* their alts move, so "has the map open" is an account-level fact. The viewers route resolves connected accounts → their characters.
- The registry lives on `globalThis` under `Symbol.for('aperture.realtime.mapViewers')` so the WS server (loaded outside Next's bundler by `server.ts`) and the API route (inside Next's bundler) — separate module graphs in the same process — share one instance. Mirrors the HMR singleton guard in `db/client.ts`/`bus.ts`.
- Refcounted per `(mapId, userId)`: an account with the map open across several tabs/devices/characters stays "viewing" until its last socket closes.
- In-memory and ephemeral: a process restart clears it; clients re-announce on reconnect.
- No `import 'server-only'` — imported on the `server.ts` side where the shim doesn't resolve.
