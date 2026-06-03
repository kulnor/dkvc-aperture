import { describe, expect, it } from 'vitest';
import { computeSubchain, neighborsOf } from '@/lib/map/subchainGraph';

/** Helper: build the system + connection refs from a compact edge list. */
function graph(edges: Array<[string, string]>) {
  const ids = new Set<string>();
  for (const [a, b] of edges) {
    ids.add(a);
    ids.add(b);
  }
  return {
    systems: [...ids].map((id) => ({ id })),
    connections: edges.map(([source, target]) => ({ source, target })),
  };
}

const sorted = (s: Set<string>) => [...s].sort();

describe('computeSubchain', () => {
  it('takes the whole tail of a linear chain (head + everything past it)', () => {
    // Home — R — N — A — B, anchored on Home.
    const g = graph([
      ['Home', 'R'],
      ['R', 'N'],
      ['N', 'A'],
      ['A', 'B'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    // From N, the anchor (Home) blocks the path back through R, so R is the
    // boundary — N, A, B go; Home and R stay.
    expect(sorted(out)).toEqual(['A', 'B', 'N']);
  });

  it('sweeps every branch hanging off the head', () => {
    // N has two children A and C (with C—D); all are downstream of N.
    const g = graph([
      ['Home', 'N'],
      ['N', 'A'],
      ['A', 'B'],
      ['N', 'C'],
      ['C', 'D'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    expect(sorted(out)).toEqual(['A', 'B', 'C', 'D', 'N']);
  });

  it('keeps systems still reachable via a loop, deleting only the orphaned head', () => {
    // N — A — B and B also loops back to Home. Removing N leaves A and B still
    // reachable from Home (Home — B — A), so they survive; only N is orphaned.
    const g = graph([
      ['Home', 'N'],
      ['N', 'A'],
      ['A', 'B'],
      ['B', 'Home'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    expect(sorted(out)).toEqual(['N']);
    expect(out.has('Home')).toBe(false);
  });

  it('keeps the head’s parent (the system between head and anchor)', () => {
    // Home — R — N — A — B. R is N's parent; it stays reachable from Home after
    // N is removed, so only N, A, B are deleted (covered by the linear case too,
    // asserted explicitly here for the parent-preservation invariant).
    const g = graph([
      ['Home', 'R'],
      ['R', 'N'],
      ['N', 'A'],
      ['A', 'B'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    expect(out.has('R')).toBe(false);
    expect(out.has('Home')).toBe(false);
  });

  it('removes the whole component when the head is already cut off from the anchor', () => {
    // Home sits alone; N—A—B is a detached cluster (hole already gone).
    const g = graph([
      ['Home', 'R'],
      ['N', 'A'],
      ['A', 'B'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    expect(sorted(out)).toEqual(['A', 'B', 'N']);
  });

  it('deletes only the head when it is a leaf hanging off the anchor', () => {
    const g = graph([['Home', 'N']]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'Home' });
    expect(sorted(out)).toEqual(['N']);
  });

  it('keeps the chosen keep-side neighbour when anchoring on a neighbour (no Home)', () => {
    // No Home: anchor on R (keep side). N's other branch (A, B) is deleted.
    const g = graph([
      ['R', 'N'],
      ['N', 'A'],
      ['A', 'B'],
    ]);
    const out = computeSubchain({ ...g, headId: 'N', anchorId: 'R' });
    expect(sorted(out)).toEqual(['A', 'B', 'N']);
    expect(out.has('R')).toBe(false);
  });

  it('returns empty when head and anchor are the same node', () => {
    const g = graph([['Home', 'N']]);
    expect(computeSubchain({ ...g, headId: 'N', anchorId: 'N' }).size).toBe(0);
  });

  it('returns empty when the head is not a known system', () => {
    const g = graph([['Home', 'N']]);
    expect(computeSubchain({ ...g, headId: 'ghost', anchorId: 'Home' }).size).toBe(0);
  });
});

describe('neighborsOf', () => {
  it('returns direct neighbours regardless of edge direction, deduplicated', () => {
    const connections = [
      { source: 'N', target: 'A' },
      { source: 'R', target: 'N' },
      { source: 'N', target: 'A' }, // duplicate edge
      { source: 'X', target: 'Y' },
    ];
    expect(neighborsOf(connections, 'N')).toEqual(['A', 'R']);
  });

  it('returns empty for an isolated system', () => {
    expect(neighborsOf([{ source: 'A', target: 'B' }], 'Z')).toEqual([]);
  });
});
