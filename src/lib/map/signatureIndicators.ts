import type { MapSignature, SignatureIndicatorPrefs } from '@/types';

// Pure logic behind the per-system stale / unscanned signature map indicators.
// No `Date.now()` here — callers pass `nowMs` so the ticking client context and
// the unit tests both stay deterministic.

/** Per-system rollup of a map's signatures, keyed by `mapSystemId`. */
export type SigSummary = {
  count: number;
  /** Newest `updated_at` across the system's sigs (epoch ms), or null when empty. */
  latestUpdatedAtMs: number | null;
  /** How many sigs are not fully classified (see `isUnscanned`). */
  unscannedCount: number;
};

/** What `SystemNode` renders. `ageMs` is null when there are no sigs to age. */
export type IndicatorState = {
  stale: boolean;
  ageMs: number | null;
  unscanned: number;
};

/**
 * A signature is "unscanned" when it hasn't been resolved enough to be useful:
 * no group at all, or a wormhole that's missing its type or its "leads to"
 * connection. Cosmic sigs (relic/data/gas/…) are intentionally *not* counted
 * for a missing site `name` — people rarely fill it and it would be noise.
 */
export function isUnscanned(sig: MapSignature): boolean {
  if (sig.groupKey === null) return true;
  if (sig.groupKey === 'wormhole') return sig.typeId === null || sig.mapConnectionId === null;
  return false;
}

/** Roll a flat signature array up into a per-`mapSystemId` summary. */
export function summariseSignatures(sigs: MapSignature[]): Map<string, SigSummary> {
  const out = new Map<string, SigSummary>();
  for (const sig of sigs) {
    const existing = out.get(sig.mapSystemId);
    const updatedMs = Date.parse(sig.updatedAt);
    const latest = Number.isNaN(updatedMs) ? null : updatedMs;
    if (!existing) {
      out.set(sig.mapSystemId, {
        count: 1,
        latestUpdatedAtMs: latest,
        unscannedCount: isUnscanned(sig) ? 1 : 0,
      });
      continue;
    }
    existing.count += 1;
    if (isUnscanned(sig)) existing.unscannedCount += 1;
    if (latest !== null && (existing.latestUpdatedAtMs === null || latest > existing.latestUpdatedAtMs)) {
      existing.latestUpdatedAtMs = latest;
    }
  }
  return out;
}

/**
 * Resolve the indicator state for one system. A system is stale when its newest
 * sig is older than the (effective) threshold; a *wormhole* system with no sigs
 * counts as stale too (it needs a scan), while empty k-space shows nothing. Both
 * flags are gated by the user's toggles in `prefs`.
 */
export function resolveIndicator(
  summary: SigSummary | undefined,
  isWormhole: boolean,
  prefs: SignatureIndicatorPrefs,
  nowMs: number,
): IndicatorState {
  const unscanned = prefs.showUnscanned ? (summary?.unscannedCount ?? 0) : 0;

  if (!prefs.showStale) return { stale: false, ageMs: null, unscanned };

  const thresholdMs = prefs.thresholdMinutes * 60_000;

  if (!summary || summary.count === 0) {
    // Empty: only wormhole systems are flagged (k-space may legitimately have
    // no signatures). No age to show.
    return { stale: isWormhole, ageMs: null, unscanned };
  }

  if (summary.latestUpdatedAtMs === null) {
    return { stale: false, ageMs: null, unscanned };
  }

  const ageMs = nowMs - summary.latestUpdatedAtMs;
  return { stale: ageMs > thresholdMs, ageMs, unscanned };
}
