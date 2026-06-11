import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  universeFactionWarSystem,
  universeIncursion,
  universeSovereigntyMap,
  universeSystem,
} from '@/db/schema';
import {
  anoikSystemUrl,
  ccpImageUrl,
  dotlanSystemUrl,
  eveeyeSystemUrl,
  zkillboardSystemUrl,
} from '@/lib/integrations/links';
import {
  connectionsForSystem,
  fetchEveScoutConnections,
  type EveScoutConnectionSummary,
} from '@/lib/integrations/evescout';
import { cachedEntityNames } from '@/lib/eve/entityNames';

export type SovereigntyIntel = {
  factionId: string | null;
  allianceId: string | null;
  corporationId: string | null;
  factionName: string | null;
  allianceName: string | null;
  corporationName: string | null;
  allianceImage: string | null;
  corporationImage: string | null;
};

export type FactionWarIntel = {
  ownerFactionId: string | null;
  occupierFactionId: string | null;
  ownerFactionName: string | null;
  occupierFactionName: string | null;
  contested: string | null;
  victoryPoints: number | null;
  victoryPointsThreshold: number | null;
};

export type IncursionIntel = {
  state: string;
  influence: number;
  factionId: string | null;
  factionName: string | null;
  hasBoss: boolean;
  isStaging: boolean;
};

export type SystemExternalLinks = {
  dotlan: string;
  eveeye: string;
  anoik: string;
  zkillboard: string;
};

export type SystemIntelSummary = {
  sovereignty: SovereigntyIntel | null;
  factionWar: FactionWarIntel | null;
  incursion: IncursionIntel | null;
  scoutConnections: EveScoutConnectionSummary[];
  links: SystemExternalLinks;
};

type SovRow = { factionId: bigint | null; allianceId: bigint | null; corporationId: bigint | null };
type FwRow = {
  ownerFactionId: bigint | null;
  occupierFactionId: bigint | null;
  contested: string | null;
  victoryPoints: number | null;
  victoryPointsThreshold: number | null;
};
type IncursionRow = {
  factionId: bigint | null;
  stagingSolarSystemId: number | null;
  hasBoss: boolean;
  influence: number;
  state: string;
  infestedSolarSystems: number[];
};

export async function intelForSystems(systemIds: number[]): Promise<Record<number, SystemIntelSummary>> {
  if (systemIds.length === 0) return {};
  const systems = await db
    .select({ id: universeSystem.id, name: universeSystem.name })
    .from(universeSystem)
    .where(inArray(universeSystem.id, systemIds));
  const [sovRows, fwRows, incursions, scoutRows] = await Promise.all([
    loadSov(systemIds),
    loadFw(systemIds),
    loadIncursions(),
    safeScoutConnections(),
  ]);

  // Map each infested (and staging) system to its incursion.
  const incursionBySystem = new Map<number, IncursionRow>();
  for (const inc of incursions) {
    for (const sysId of inc.infestedSolarSystems) incursionBySystem.set(sysId, inc);
    if (inc.stagingSolarSystemId != null) incursionBySystem.set(inc.stagingSolarSystemId, inc);
  }

  // Resolve names from the cache for every entity id we'll display — one query,
  // no ESI. Ids missing from the cache fall back to their raw id in the UI.
  const entityIds: number[] = [];
  for (const system of systems) {
    const sov = sovRows.get(system.id);
    if (sov) pushIds(entityIds, sov.factionId, sov.allianceId, sov.corporationId);
    const fw = fwRows.get(system.id);
    if (fw) pushIds(entityIds, fw.ownerFactionId, fw.occupierFactionId);
    const inc = incursionBySystem.get(system.id);
    if (inc) pushIds(entityIds, inc.factionId);
  }
  const names = await cachedEntityNames(entityIds);

  const out: Record<number, SystemIntelSummary> = {};
  for (const system of systems) {
    out[system.id] = {
      sovereignty: buildSov(sovRows.get(system.id), names),
      factionWar: buildFw(fwRows.get(system.id), names),
      incursion: buildIncursion(incursionBySystem.get(system.id), system.id, names),
      scoutConnections: connectionsForSystem(scoutRows, system.id),
      links: {
        dotlan: dotlanSystemUrl(system.name),
        eveeye: eveeyeSystemUrl(system.id),
        anoik: anoikSystemUrl(system.name),
        zkillboard: zkillboardSystemUrl(system.id),
      },
    };
  }
  return out;
}

async function loadSov(systemIds: number[]): Promise<Map<number, SovRow>> {
  const rows = await db
    .select()
    .from(universeSovereigntyMap)
    .where(inArray(universeSovereigntyMap.systemId, systemIds));
  return new Map(
    rows.map((r) => [
      r.systemId,
      { factionId: r.factionId, allianceId: r.allianceId, corporationId: r.corporationId },
    ]),
  );
}

async function loadFw(systemIds: number[]): Promise<Map<number, FwRow>> {
  const rows = await db
    .select()
    .from(universeFactionWarSystem)
    .where(inArray(universeFactionWarSystem.systemId, systemIds));
  return new Map(
    rows.map((r) => [
      r.systemId,
      {
        ownerFactionId: r.ownerFactionId,
        occupierFactionId: r.occupierFactionId,
        contested: r.contested,
        victoryPoints: r.victoryPoints,
        victoryPointsThreshold: r.victoryPointsThreshold,
      },
    ]),
  );
}

async function loadIncursions(): Promise<IncursionRow[]> {
  return db
    .select({
      factionId: universeIncursion.factionId,
      stagingSolarSystemId: universeIncursion.stagingSolarSystemId,
      hasBoss: universeIncursion.hasBoss,
      influence: universeIncursion.influence,
      state: universeIncursion.state,
      infestedSolarSystems: universeIncursion.infestedSolarSystems,
    })
    .from(universeIncursion);
}

function buildSov(row: SovRow | undefined, names: Map<number, string>): SovereigntyIntel | null {
  if (!row) return null;
  return {
    factionId: row.factionId?.toString() ?? null,
    allianceId: row.allianceId?.toString() ?? null,
    corporationId: row.corporationId?.toString() ?? null,
    factionName: nameOf(names, row.factionId),
    allianceName: nameOf(names, row.allianceId),
    corporationName: nameOf(names, row.corporationId),
    allianceImage: row.allianceId ? ccpImageUrl('alliances', row.allianceId, 'logo', 64) : null,
    corporationImage: row.corporationId ? ccpImageUrl('corporations', row.corporationId, 'logo', 64) : null,
  };
}

function buildFw(row: FwRow | undefined, names: Map<number, string>): FactionWarIntel | null {
  if (!row) return null;
  return {
    ownerFactionId: row.ownerFactionId?.toString() ?? null,
    occupierFactionId: row.occupierFactionId?.toString() ?? null,
    ownerFactionName: nameOf(names, row.ownerFactionId),
    occupierFactionName: nameOf(names, row.occupierFactionId),
    contested: row.contested,
    victoryPoints: row.victoryPoints,
    victoryPointsThreshold: row.victoryPointsThreshold,
  };
}

function buildIncursion(
  row: IncursionRow | undefined,
  systemId: number,
  names: Map<number, string>,
): IncursionIntel | null {
  if (!row) return null;
  return {
    state: row.state,
    influence: row.influence,
    factionId: row.factionId?.toString() ?? null,
    factionName: nameOf(names, row.factionId),
    hasBoss: row.hasBoss,
    isStaging: row.stagingSolarSystemId === systemId,
  };
}

function nameOf(names: Map<number, string>, id: bigint | null): string | null {
  return id != null ? (names.get(Number(id)) ?? null) : null;
}

function pushIds(out: number[], ...ids: (bigint | null)[]): void {
  for (const id of ids) if (id != null) out.push(Number(id));
}

async function safeScoutConnections(): Promise<EveScoutConnectionSummary[]> {
  try {
    return await fetchEveScoutConnections();
  } catch {
    return [];
  }
}
