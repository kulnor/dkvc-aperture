/**
 * Canonical opKey → OpenAPI operationId map for the ESI client.
 *
 * "opKey" is our short internal name for an ESI operation (e.g.
 * `getCharacterLocation`). Each opKey resolves to an OpenAPI `operationId`
 * (e.g. `GetCharactersCharacterIdLocation`), and `src/lib/esi/openapi.json`
 * is authoritative for the HTTP method + path + params that operationId names.
 *
 * A few pairings could not be confirmed against an authoritative dispatcher and
 * were inferred from call-site signatures — those carry `inferred: true`. The
 * companion test (`tests/esi/opkeys.test.ts`) asserts every operationId below
 * exists in the checked-in OpenAPI spec so a typo or drift fails loudly.
 *
 * This module is data only — no request logic.
 */

export interface OpDef {
  /** swagger `operationId` resolving the HTTP method/path/params. */
  operationId: string;
  /** Whether the call requires a character ESI access token. */
  auth: 'none' | 'character';
  /**
   * True when the opKey→operationId pairing could not be confirmed against an
   * authoritative source and was inferred from call-site signatures.
   */
  inferred?: true;
}

export const OP_KEYS = {
  // Status
  getStatus: { operationId: 'GetStatus', auth: 'none' },

  // Character
  getCharacter: { operationId: 'GetCharactersDetail', auth: 'none' },
  getCharacterAffiliation: { operationId: 'PostCharactersAffiliation', auth: 'none' },
  getCharacterRoles: { operationId: 'GetCharactersCharacterIdRoles', auth: 'character' },
  getCharacterTitles: { operationId: 'GetCharactersCharacterIdTitles', auth: 'character' },
  getCharacterClones: { operationId: 'GetCharactersCharacterIdClones', auth: 'character' },
  getCharacterOnline: { operationId: 'GetCharactersCharacterIdOnline', auth: 'character' },
  getCharacterLocation: { operationId: 'GetCharactersCharacterIdLocation', auth: 'character' },
  getCharacterShip: { operationId: 'GetCharactersCharacterIdShip', auth: 'character' },

  // Corporation / Alliance
  getCorporation: { operationId: 'GetCorporationsCorporationId', auth: 'none' },
  getCorporationRoles: { operationId: 'GetCharactersCharacterIdRoles', auth: 'character' },
  getNpcCorporations: { operationId: 'GetCorporationsNpccorps', auth: 'none' },
  getAlliance: { operationId: 'GetAlliancesAllianceId', auth: 'none' },

  // UI mutations (option-bag arguments — inferred)
  setWaypoint: { operationId: 'PostUiAutopilotWaypoint', auth: 'character', inferred: true },
  openWindow: { operationId: 'PostUiOpenwindowInformation', auth: 'character', inferred: true },

  // Routing / search
  getRoute: { operationId: 'PostRoute', auth: 'none', inferred: true },
  search: { operationId: 'GetCharactersCharacterIdSearch', auth: 'character' },
  getUniverseNames: { operationId: 'PostUniverseNames', auth: 'none' },

  // Universe — geography
  getUniverseSystems: { operationId: 'GetUniverseSystems', auth: 'none' },
  getUniverseSystem: { operationId: 'GetUniverseSystemsSystemId', auth: 'none' },
  getUniverseConstellations: { operationId: 'GetUniverseConstellations', auth: 'none' },
  getUniverseConstellation: { operationId: 'GetUniverseConstellationsConstellationId', auth: 'none' },
  getUniverseRegions: { operationId: 'GetUniverseRegions', auth: 'none' },
  getUniverseRegion: { operationId: 'GetUniverseRegionsRegionId', auth: 'none' },
  getUniverseStargate: { operationId: 'GetUniverseStargatesStargateId', auth: 'none' },
  getUniverseStation: { operationId: 'GetUniverseStationsStationId', auth: 'none' },
  getUniverseStar: { operationId: 'GetUniverseStarsStarId', auth: 'none' },
  getUniversePlanet: { operationId: 'GetUniversePlanetsPlanetId', auth: 'none' },

  // Universe — items / dogma
  getUniverseCategories: { operationId: 'GetUniverseCategories', auth: 'none' },
  getUniverseCategory: { operationId: 'GetUniverseCategoriesCategoryId', auth: 'none' },
  getUniverseGroups: { operationId: 'GetUniverseGroups', auth: 'none' },
  getUniverseGroup: { operationId: 'GetUniverseGroupsGroupId', auth: 'none' },
  getUniverseType: { operationId: 'GetUniverseTypesTypeId', auth: 'none' },
  getDogmaAttribute: { operationId: 'GetDogmaAttributesAttributeId', auth: 'none' },
  getUniverseRace: { operationId: 'GetUniverseRaces', auth: 'none' },
  getUniverseFaction: { operationId: 'GetUniverseFactions', auth: 'none' },

  // Structures (player citadels)
  getUniverseStructure: { operationId: 'GetUniverseStructuresStructureId', auth: 'character' },

  // Killmails (zKillboard list entries carry only id + hash; the body is here)
  getKillmail: { operationId: 'GetKillmailsKillmailIdKillmailHash', auth: 'none' },

  // Stats / sovereignty (cron-driven)
  getUniverseJumps: { operationId: 'GetUniverseSystemJumps', auth: 'none' },
  getUniverseKills: { operationId: 'GetUniverseSystemKills', auth: 'none' },
  getSovereigntyMap: { operationId: 'GetSovereigntySystems', auth: 'none' },
  getFactionWarSystems: { operationId: 'GetFwSystems', auth: 'none' },
  getIncursions: { operationId: 'GetIncursions', auth: 'none' },
} as const satisfies Record<string, OpDef>;

export type OpKey = keyof typeof OP_KEYS;
