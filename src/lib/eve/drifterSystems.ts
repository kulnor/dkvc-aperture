// The five Drifter ("Uni") wormhole systems. CCP's 2025 conquest event renamed
// them and consolidated all five into a single constellation (K-C00334, region
// K-R00033), so the SDE constellation `wormholeClassID` can no longer tell them
// apart — every system in that constellation now reports class 1. Their real
// classes (C14–C18) are therefore pinned here by solar-system id.
//
// `shortName` is the community handle (Barbican, Conflux, …) shown on the map
// node and in the inspector; the stored `universe_system.name` keeps CCP's
// canonical lore name (e.g. "Liberated Barbican").

export interface DrifterSystem {
  /** Wormhole class number, 14–18. */
  classId: number;
  /** Short community name shown in the inspector and on the map node. */
  shortName: string;
}

export const DRIFTER_SYSTEMS: Record<number, DrifterSystem> = {
  31000001: { classId: 14, shortName: 'Sentinel' },
  31000002: { classId: 15, shortName: 'Barbican' },
  31000003: { classId: 16, shortName: 'Vidette' },
  31000004: { classId: 17, shortName: 'Conflux' },
  31000006: { classId: 18, shortName: 'Redoubt' },
};

/** `C14`–`C18` for a Drifter system id, or null if the id is not a Drifter system. */
export function drifterClassLabel(systemId: number): string | null {
  const d = DRIFTER_SYSTEMS[systemId];
  return d ? `C${d.classId}` : null;
}

/** True if the solar-system id is one of the five Drifter wormhole systems. */
export function isDrifterSystem(systemId: number): boolean {
  return systemId in DRIFTER_SYSTEMS;
}

/** Short display name for the inspector / map node; falls back to the stored name. */
export function systemDisplayName(systemId: number, name: string): string {
  return DRIFTER_SYSTEMS[systemId]?.shortName ?? name;
}
