import type { SystemNotificationLoad } from '@/lib/realtime/protocol';
import type { UnderglowConfig } from '@/types';

/**
 * Client-side visual presets per `systemNotification` kind. The server sends a
 * lean `kind` over the wire; the client owns the look here so the transport
 * stays decoupled from styling. This is also where future state-derived glows
 * (rally point, unscanned signatures) get their presets — they'd use
 * `durationMs: 0` (persistent until cleared) rather than the transient pulse.
 */
export const UNDERGLOW_PRESETS: Record<SystemNotificationLoad['kind'], UnderglowConfig> = {
  // Killmail: red, ~15s transient pulse.
  killmail: { color: '#ef4444', brightness: 0.9, durationMs: 15_000, speedMs: 1_400 },
  // Ping: a short, fast sky-blue pulse — a user draws attention to a system
  // without the commitment of a rally point. Distinct hue and a brisker cycle
  // than the killmail alert so the two read differently.
  ping: { color: '#38bdf8', brightness: 0.95, durationMs: 3_000, speedMs: 1_000 },
};
