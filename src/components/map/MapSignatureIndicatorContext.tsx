'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { MapSignature, SignatureIndicatorPrefs } from '@/types';
import {
  resolveIndicator,
  summariseSignatures,
  type IndicatorState,
  type SigSummary,
} from '@/lib/map/signatureIndicators';

// Per-system store for the stale / unscanned signature map indicators on
// `SystemNode`. Like `MapPresenceContext`, each node subscribes only to its own
// slice (keyed by `mapSystemId`) via `useSyncExternalStore`, so a paste or the
// once-a-minute clock tick re-renders only the nodes whose displayed indicator
// actually changed — not every node on the map.

// How often to re-evaluate staleness against the wall clock.
const TICK_MS = 60_000;

type Subscriber = () => void;

const EMPTY: IndicatorState = Object.freeze({ stale: false, ageMs: null, unscanned: 0 });

/** Coarse equality: stale flag, unscanned count, and age bucketed to the minute
 * (the finest granularity the rendered age label changes). Keeps the snapshot
 * reference stable so an unchanged system never re-renders on a tick. */
function sameState(a: IndicatorState, b: IndicatorState): boolean {
  return (
    a.stale === b.stale &&
    a.unscanned === b.unscanned &&
    minuteBucket(a.ageMs) === minuteBucket(b.ageMs)
  );
}

function minuteBucket(ms: number | null): number {
  return ms === null ? -1 : Math.floor(ms / 60_000);
}

export class SignatureIndicatorStore {
  private summaries: Map<string, SigSummary>;
  private prefs: SignatureIndicatorPrefs;
  private nowMs = Date.now();
  // Whether each subscribed system is a wormhole (decides empty-as-stale). The
  // node supplies this; we only track systems someone is actually watching.
  private isWormhole = new Map<string, boolean>();
  // Cached, referentially-stable state per system (the snapshot read).
  private state = new Map<string, IndicatorState>();
  private subs = new Map<string, Set<Subscriber>>();

  constructor(signatures: MapSignature[], prefs: SignatureIndicatorPrefs) {
    this.summaries = summariseSignatures(signatures);
    this.prefs = prefs;
  }

  /** Re-seed from a fresh signature array / prefs (realtime paste, settings change). */
  seed(signatures: MapSignature[], prefs: SignatureIndicatorPrefs): void {
    this.summaries = summariseSignatures(signatures);
    this.prefs = prefs;
    this.recomputeAll();
  }

  /** Advance the clock and refresh staleness. */
  tick(): void {
    this.nowMs = Date.now();
    this.recomputeAll();
  }

  /**
   * Ensure a system's state is computed for `isWormhole`. Called from the hook
   * during render so the first paint is correct (computes silently — never
   * notifies during render). Recomputes if the wormhole flag changed.
   */
  ensureSystem(mapSystemId: string, isWormhole: boolean): void {
    if (this.isWormhole.get(mapSystemId) === isWormhole && this.state.has(mapSystemId)) return;
    this.isWormhole.set(mapSystemId, isWormhole);
    this.recomputeSystem(mapSystemId, false);
  }

  getForSystem(mapSystemId: string): IndicatorState {
    return this.state.get(mapSystemId) ?? EMPTY;
  }

  subscribe(mapSystemId: string, sub: Subscriber): () => void {
    let set = this.subs.get(mapSystemId);
    if (!set) {
      set = new Set();
      this.subs.set(mapSystemId, set);
    }
    set.add(sub);
    return () => {
      const s = this.subs.get(mapSystemId);
      if (!s) return;
      s.delete(sub);
      if (s.size === 0) this.subs.delete(mapSystemId);
    };
  }

  private recomputeAll(): void {
    for (const id of this.isWormhole.keys()) this.recomputeSystem(id, true);
  }

  /** Recompute one system; returns true and (optionally) notifies if it changed. */
  private recomputeSystem(mapSystemId: string, notify: boolean): boolean {
    const next = resolveIndicator(
      this.summaries.get(mapSystemId),
      this.isWormhole.get(mapSystemId) ?? false,
      this.prefs,
      this.nowMs,
    );
    const prev = this.state.get(mapSystemId);
    if (prev && sameState(prev, next)) return false;
    this.state.set(mapSystemId, next);
    if (notify) {
      const set = this.subs.get(mapSystemId);
      if (set) for (const sub of set) sub();
    }
    return true;
  }
}

const SignatureIndicatorContext = createContext<SignatureIndicatorStore | null>(null);

export function MapSignatureIndicatorProvider({
  signatures,
  prefs,
  children,
}: {
  signatures: MapSignature[];
  prefs: SignatureIndicatorPrefs;
  children: ReactNode;
}) {
  const [store] = useState(() => new SignatureIndicatorStore(signatures, prefs));

  // Re-seed whenever the signature array or prefs reference changes (realtime
  // folds a fresh array into `viewData.signatures`; settings change swaps prefs).
  const seededRef = useRef<{ signatures: MapSignature[]; prefs: SignatureIndicatorPrefs }>({
    signatures,
    prefs,
  });
  useEffect(() => {
    if (seededRef.current.signatures === signatures && seededRef.current.prefs === prefs) return;
    seededRef.current = { signatures, prefs };
    store.seed(signatures, prefs);
  }, [signatures, prefs, store]);

  // Wall-clock tick so a system silently crosses the threshold without any edit.
  useEffect(() => {
    const id = setInterval(() => store.tick(), TICK_MS);
    return () => clearInterval(id);
  }, [store]);

  return (
    <SignatureIndicatorContext.Provider value={store}>
      {children}
    </SignatureIndicatorContext.Provider>
  );
}

/**
 * The stale / unscanned indicator state for one map system. `isWormhole` decides
 * whether an *empty* system counts as stale (k-space with no sigs shows nothing).
 * The returned reference is stable until this system's displayed state changes.
 */
export function useSignatureIndicator(mapSystemId: string, isWormhole: boolean): IndicatorState {
  const store = useContext(SignatureIndicatorContext);
  // Populate the cache before the first snapshot read so the first paint is correct.
  store?.ensureSystem(mapSystemId, isWormhole);
  const subscribe = useCallback(
    (cb: () => void) => store?.subscribe(mapSystemId, cb) ?? (() => {}),
    [store, mapSystemId],
  );
  const getSnapshot = useCallback(
    () => store?.getForSystem(mapSystemId) ?? EMPTY,
    [store, mapSystemId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
