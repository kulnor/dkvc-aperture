## MapSignatureIndicatorContext

**Purpose:** Per-system store + hook driving the stale / unscanned signature indicators on `SystemNode`, mirroring `MapPresenceContext`'s slice-subscription pattern so a paste or the once-a-minute clock tick re-renders only the nodes whose displayed indicator changed.
**File:** `src/components/map/MapSignatureIndicatorContext.tsx`

---

### MapSignatureIndicatorProvider (component)
Props: `signatures: MapSignature[]`, `prefs: SignatureIndicatorPrefs`, `children`.
- Constructs a `SignatureIndicatorStore` once; **re-seeds** it when the `signatures` or `prefs` **reference** changes (realtime folds a fresh array into `MapCanvas`'s `viewData.signatures`; a settings change swaps `prefs`).
- Runs a 60s `setInterval` calling `store.tick()` so a system silently crosses the stale threshold without any edit.
- Provided inside the `MapCanvas` provider stack (alongside `MapPresenceProvider`).

### useSignatureIndicator(mapSystemId: string, isWormhole: boolean): IndicatorState
The indicator state for one system. `isWormhole` decides whether an *empty* system counts as stale (k-space empty shows nothing). Calls `store.ensureSystem` during render so the first paint is correct, then subscribes to the system's slice via `useSyncExternalStore`. The returned reference is stable until the system's displayed state changes.

### SignatureIndicatorStore (class)
- `summariseSignatures` rollup + `prefs` + a `nowMs` clock; per-system cached `IndicatorState` (stable refs) and per-system subscriber sets.
- `seed(signatures, prefs)` / `tick()` recompute all *registered* systems and notify only those whose state changed (per `sameState`: stale flag, unscanned count, age bucketed to the minute).
- `ensureSystem(id, isWormhole)` records the wormhole flag and computes silently (never notifies during render).
- `getForSystem(id)` returns the cached state (or a frozen `EMPTY`); `subscribe(id, cb)` registers a slice listener.

### Depends On
- `@/lib/map/signatureIndicators` (`summariseSignatures`, `resolveIndicator`, `SigSummary`, `IndicatorState`).
- `@/types` (`MapSignature`, `SignatureIndicatorPrefs`).
