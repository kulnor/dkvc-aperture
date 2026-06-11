// Shattered wormhole systems. A shattered system has had its planets and moons
// blasted apart — no anchorable celestials, a permanent system effect, and
// (for the class-13 frigate holes) hard ship-size limits. None of this is
// derivable from the SDE we ingest, and it is not obvious from a J-sig, so the
// set is pinned here by solar-system id.
//
// Source: anoik.is static dataset (`static.json?version=11`, pulled 2026-05-22 —
// the same vendored snapshot the SDE ingest draws its WH catalog from). anoik
// marks a shattered system by giving it a "Planet (Shattered)" celestial
// (celestial type 30889); this list is every such system. The five Drifter
// systems are also shattered in-game but carry their own identity (see
// `drifterSystems.ts`) and are intentionally excluded here so the map can flag
// the two kinds separately. Thera is included — it is a genuine shattered system.
//
// Re-pull: refetch `static.json`, collect every `solarSystemID` whose `cels`
// contains a celestial of type 30889, drop the five Drifter ids, sort ascending.

const SHATTERED_SYSTEM_IDS: ReadonlySet<number> = new Set([
  31000005, 31001159, 31002177, 31002505, 31002506, 31002507, 31002508, 31002509,
  31002510, 31002511, 31002512, 31002513, 31002514, 31002515, 31002516, 31002517,
  31002518, 31002519, 31002520, 31002521, 31002522, 31002523, 31002524, 31002525,
  31002526, 31002527, 31002528, 31002529, 31002530, 31002531, 31002532, 31002533,
  31002534, 31002535, 31002536, 31002537, 31002538, 31002539, 31002540, 31002541,
  31002542, 31002543, 31002544, 31002545, 31002546, 31002547, 31002548, 31002549,
  31002550, 31002551, 31002552, 31002553, 31002554, 31002555, 31002556, 31002557,
  31002558, 31002559, 31002560, 31002561, 31002562, 31002563, 31002564, 31002565,
  31002566, 31002567, 31002568, 31002569, 31002570, 31002571, 31002572, 31002573,
  31002574, 31002575, 31002576, 31002577, 31002578, 31002579, 31002580, 31002581,
  31002582, 31002583, 31002584, 31002585, 31002586, 31002587, 31002588, 31002589,
  31002590, 31002591, 31002592, 31002593, 31002594, 31002595, 31002596, 31002597,
  31002598, 31002599, 31002600, 31002601, 31002602, 31002603, 31002604,
]);

/** True if the solar-system id is a shattered wormhole system (excludes the Drifter systems). */
export function isShatteredSystem(systemId: number): boolean {
  return SHATTERED_SYSTEM_IDS.has(systemId);
}
