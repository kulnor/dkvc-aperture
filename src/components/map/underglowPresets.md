## underglowPresets.ts

**Purpose:** Client-side registry mapping a `systemNotification` kind to its `UnderglowConfig` (color/brightness/duration/speed) — keeps the wire lean (server sends `kind`, client owns the look).
**File:** `src/components/map/underglowPresets.ts`

---

### UNDERGLOW_PRESETS
`Record<SystemNotificationLoad['kind'], UnderglowConfig>`. Keyed by `systemNotification` kind so `MapUnderglowBridge` looks up the look from the incoming `kind`:
- `killmail` → red, ~15s transient pulse (server-observed zKB kill).
- `ping` → short (3s) sky-blue (`#38bdf8`) pulse, brisker cycle — a user-initiated attention pulse fired from the system context menu (`MapContextMenu` → `/api/map/[mapId]/ping`) and broadcast to every viewer.

Future state-derived glows (rally point, unscanned signatures) get presets here too, with `durationMs: 0` (persistent until cleared) instead of a transient lifetime.

### Depends On
- `@/lib/realtime/protocol` (`SystemNotificationLoad`), `@/types` (`UnderglowConfig`).
