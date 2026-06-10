/**
 * Process-wide roster of which *accounts* currently have each map open in a live
 * WebSocket — the signal behind the pilot-roster "online but map not open" icon.
 *
 * Keyed by account (`ap_user.id`), not character, on purpose: a session holds
 * one active character but an account owns many, and location tracking is
 * per-character, so a single human can have several alts on the roster at once.
 * If their account has the map open, that human can see *all* their alts move —
 * so coverage is an account-level fact. The `GET /api/map/[mapId]/viewers` route
 * expands these connected account ids to the character ids they own.
 *
 * Written by the WS server (`wsServer.ts`, loaded by the custom `server.ts`
 * outside Next's bundler) on subscribe/unsubscribe/close; read by the route
 * (inside Next's bundler). Those two live in separate module graphs, so the
 * registry is pinned on `globalThis` — one object per Node process, reachable
 * from both — mirroring the singleton guard `db/client.ts` and `bus.ts` use to
 * survive HMR.
 *
 * Shape: mapId → userId → open-socket refcount. Refcounted so an account holding
 * the map open across several tabs/devices/characters stays "viewing" until its
 * last socket closes. Purely in-memory and ephemeral: a process restart clears
 * it and clients re-announce when they reconnect.
 *
 * No `import 'server-only'`: like `bus.ts`/`wsServer.ts` this is imported on the
 * `server.ts` side where the `server-only` shim doesn't resolve.
 */

type ViewerRegistry = Map<bigint, Map<number, number>>;

// Symbol.for keeps the slot stable even if this module is duplicated across the
// Next/server.ts module graphs — both resolve the same registered symbol.
const REGISTRY_KEY = Symbol.for('aperture.realtime.mapViewers');

function registry(): ViewerRegistry {
  const slot = globalThis as Record<symbol, unknown>;
  let reg = slot[REGISTRY_KEY] as ViewerRegistry | undefined;
  if (!reg) {
    reg = new Map();
    slot[REGISTRY_KEY] = reg;
  }
  return reg;
}

/** Record that account `userId` has one more live socket viewing `mapId`. */
export function addMapViewer(mapId: bigint, userId: number): void {
  const reg = registry();
  let users = reg.get(mapId);
  if (!users) {
    users = new Map();
    reg.set(mapId, users);
  }
  users.set(userId, (users.get(userId) ?? 0) + 1);
}

/** Drop one of account `userId`'s sockets on `mapId`; forgets it at zero. */
export function removeMapViewer(mapId: bigint, userId: number): void {
  const users = registry().get(mapId);
  if (!users) return;
  const next = (users.get(userId) ?? 0) - 1;
  if (next <= 0) {
    users.delete(userId);
    if (users.size === 0) registry().delete(mapId);
  } else {
    users.set(userId, next);
  }
}

/** Account ids (`ap_user.id`) that currently have `mapId` open in a live socket. */
export function getMapViewerUserIds(mapId: bigint): number[] {
  const users = registry().get(mapId);
  if (!users) return [];
  return [...users.keys()];
}
