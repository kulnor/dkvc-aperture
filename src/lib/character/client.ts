import { requestJson } from '@/lib/http/fetchJson';

/**
 * Browser-side helpers for character-scoped side-effect actions that touch the
 * EVE client via ESI (not map mutations). Errors are surfaced as toasts by
 * `requestJson`; callers only branch on `ok` for the success path.
 */

/**
 * Append `destinationId` (an EVE solar-system id) as an autopilot waypoint on
 * the given character's in-game route. Backs the "Set destination" context-menu
 * action. The character must belong to the signed-in user.
 */
export function setWaypointOnServer(args: {
  characterId: number;
  destinationId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return requestJson<{ ok: true }>('POST', '/api/character/waypoint', args);
}
