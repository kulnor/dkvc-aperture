import { describe, expect, it } from 'vitest';
import { planRoutesOnGraph, type RouteOverlayEdge } from '@/lib/map/routePlanner';
import type { RoutePrefs } from '@/types';

// Pure-algorithm tests for the route planner core (routes-module). No DB — drives
// `planRoutesOnGraph` with a synthetic graph.

const BASE_PREFS: RoutePrefs = {
  safety: 'shortest',
  minShipClass: null,
  avoidReduced: false,
  avoidCritical: false,
  avoidEol: false,
  includeEveScout: false,
};

/** Build a bidirectional gate adjacency from an undirected edge list. */
function gates(edges: Array<[number, number]>): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  const push = (a: number, b: number) => {
    const l = adj.get(a);
    if (l) l.push(b);
    else adj.set(a, [b]);
  };
  for (const [a, b] of edges) {
    push(a, b);
    push(b, a);
  }
  return adj;
}

// K-space layout: 1—2—4—10 (all highsec) is the long-but-safe path to hub 10;
// 1—3—10 is shorter but passes through lowsec node 3. Node 11 sits behind the
// lowsec node only (forces low transit). true_sec: high ≥0.45, 3 is low.
const ADJ = gates([
  [1, 2],
  [2, 4],
  [4, 10],
  [1, 3],
  [3, 10],
  [3, 11],
]);
const TRUE_SEC = new Map<number, number>([
  [1, 0.9],
  [2, 0.8],
  [4, 0.7],
  [10, 0.6],
  [3, 0.2],
  [11, 0.0],
]);

function hopIds(plan: { hops: Array<{ systemId: number }> }): number[] {
  return plan.hops.map((h) => h.systemId);
}

/** Plan to a single destination and return its (always-present) first plan. */
function planRoute(args: Parameters<typeof planRoutesOnGraph>[0]) {
  const plan = planRoutesOnGraph(args)[0];
  if (!plan) throw new Error('expected at least one route plan');
  return plan;
}

describe('planRoutesOnGraph', () => {
  it('shortest mode takes the fewest jumps, even through lowsec', () => {
    const plan = planRoute({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay: [],
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [10],
      prefs: { ...BASE_PREFS, safety: 'shortest' },
    });
    expect(plan.reachable).toBe(true);
    expect(plan.jumps).toBe(2);
    expect(hopIds(plan)).toEqual([1, 3, 10]);
  });

  it('safer mode detours around lowsec when a highsec path exists', () => {
    const plan = planRoute({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay: [],
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [10],
      prefs: { ...BASE_PREFS, safety: 'safer' },
    });
    expect(plan.reachable).toBe(true);
    expect(hopIds(plan)).toEqual([1, 2, 4, 10]);
  });

  it('safer mode still routes through lowsec when that is the only path', () => {
    const plan = planRoute({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay: [],
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [11],
      prefs: { ...BASE_PREFS, safety: 'safer' },
    });
    expect(plan.reachable).toBe(true);
    expect(hopIds(plan)).toEqual([1, 3, 11]);
  });

  it('min-ship filter excludes a too-small wormhole', () => {
    const overlay: RouteOverlayEdge[] = [
      { from: 1, to: 20, kind: 'wh', connectionId: 100, jumpMassClass: 's', massStatus: 'fresh', eolStage: 'none' },
    ];
    const reachable = planRoutesOnGraph({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay,
      onMapSystemIds: new Set([1, 20]),
      sourceSystemId: 1,
      destinationSystemIds: [20],
      prefs: { ...BASE_PREFS, minShipClass: null },
    })[0]!;
    expect(reachable.reachable).toBe(true);
    expect(reachable.hops[1]).toMatchObject({ systemId: 20, via: 'wh', connectionId: 100, onMap: true });

    const blocked = planRoutesOnGraph({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay,
      onMapSystemIds: new Set([1, 20]),
      sourceSystemId: 1,
      destinationSystemIds: [20],
      prefs: { ...BASE_PREFS, minShipClass: 'l' },
    })[0]!;
    expect(blocked.reachable).toBe(false);
  });

  it('avoid-EOL excludes an end-of-life wormhole', () => {
    const overlay: RouteOverlayEdge[] = [
      { from: 1, to: 21, kind: 'wh', connectionId: 101, jumpMassClass: 'xl', massStatus: 'fresh', eolStage: 'eol' },
    ];
    const allowed = planRoutesOnGraph({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay,
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [21],
      prefs: { ...BASE_PREFS, avoidEol: false },
    })[0]!;
    expect(allowed.reachable).toBe(true);

    const avoided = planRoutesOnGraph({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay,
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [21],
      prefs: { ...BASE_PREFS, avoidEol: true },
    })[0]!;
    expect(avoided.reachable).toBe(false);
  });

  it('uses an EVE-Scout edge and labels the hop', () => {
    const overlay: RouteOverlayEdge[] = [
      { from: 1, to: 22, kind: 'eve_scout', connectionId: null, jumpMassClass: null, massStatus: null, eolStage: null },
    ];
    const plan = planRoute({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay,
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [22],
      prefs: BASE_PREFS,
    });
    expect(plan.reachable).toBe(true);
    expect(plan.hops[1]).toMatchObject({ systemId: 22, via: 'eve_scout', connectionId: null });
  });

  it('reports an unreachable destination', () => {
    const plan = planRoute({
      adjacency: ADJ,
      trueSec: TRUE_SEC,
      overlay: [],
      onMapSystemIds: new Set(),
      sourceSystemId: 1,
      destinationSystemIds: [999],
      prefs: BASE_PREFS,
    });
    expect(plan.reachable).toBe(false);
    expect(plan.hops).toEqual([]);
  });
});
