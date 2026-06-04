## signatureIndicators.ts

**Purpose:** Pure logic behind the per-system stale / unscanned signature map indicators (no `Date.now()` — callers pass `nowMs`).
**File:** `src/lib/map/signatureIndicators.ts`

---

### Types
- `SigSummary` — `{ count; latestUpdatedAtMs: number | null; unscannedCount }`. Per-system rollup keyed by `mapSystemId`.
- `IndicatorState` — `{ stale: boolean; ageMs: number | null; unscanned: number }`. What `SystemNode` renders (`ageMs` null = nothing to age, e.g. an empty system).

---

### isUnscanned(sig: MapSignature): boolean
A sig is unscanned when not yet useful: `groupKey === null`, or a `wormhole` missing `typeId` **or** `mapConnectionId` ("leads to"). Cosmic sigs are **not** counted for a missing site `name` (deliberately — too noisy).

---

### summariseSignatures(sigs: MapSignature[]): Map<string, SigSummary>
Rolls a flat signature array up into a per-`mapSystemId` summary: count, newest `updated_at` (epoch ms; unparseable timestamps ignored), and unscanned count.

---

### resolveIndicator(summary, isWormhole, prefs, nowMs): IndicatorState
Resolves one system's indicator state.
- **Unscanned** = `summary.unscannedCount` when `prefs.showUnscanned`, else 0.
- **Stale** (only when `prefs.showStale`):
  - has sigs ⇒ `stale = (nowMs - latest) > prefs.thresholdMinutes*60_000`, `ageMs` set.
  - empty ⇒ `stale = isWormhole` (k-space empty shows nothing), `ageMs = null`.

**Parameters:**
- `summary` — the system's `SigSummary` or `undefined` (no sigs).
- `isWormhole` — caller-computed (J-space / has statics); decides empty-as-stale.
- `prefs` — resolved `SignatureIndicatorPrefs` (effective threshold + toggles).
- `nowMs` — current epoch ms (ticked by the client context; fixed in tests).
