## SetDestinationItem

**Purpose:** "Set destination" context menu item that sets an EVE Online autopilot waypoint for one or more located characters.
**File:** `src/components/map/SetDestinationItem.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode | yes | The map system to set as autopilot destination |
| onClose | () => void | yes | Called synchronously when the user initiates an action |

### Renders
Three branches depending on the number of located characters from `useMapActiveChar`:
- **0 chars:** a disabled flat `MenuItem`
- **1 char:** a clickable flat `MenuItem` — direct action, no submenu
- **2+ chars:** a `MenuSubmenu` with an "All characters" fan-out entry, a separator, and per-character entries

### Behaviour & Interactions
- `onClose` is called synchronously on click before the async API call resolves
- When a single character sets a waypoint and `ok: true`, shows `Waypoint set to <alias|name>`
- When `ok: false`, `SetDestinationItem` fires no toast itself — the error toast is fired automatically by `requestJson` (the HTTP utility layer), so the failure is not silent end-to-end
- Active character's entry is bold via `cn(char.id === activeCharId && 'font-bold')`

### Emits / Calls
- `setWaypointOnServer({ characterId, destinationId })` — ESI waypoint API call
- `applyWaypointFanOutResult(successes, total)` — fires appropriate toast after fan-out
- `useMapActiveChar()` — reads `activeCharId` and `locatedChars`

### Exported Functions

---

### applyWaypointFanOutResult(successes: number, total: number): void
Fires the appropriate sonner toast after an "All characters" fan-out resolves.
- 0 successes → `toast.error('Failed to set destination for any character')`
- successes === total → `toast.success('Destination set for all N characters')`
- partial → `toast.success('Destination set for X of N characters')`

Exported for unit testing.

### Depends On
- `useMapActiveChar` — provides `activeCharId` and `locatedChars`
- `setWaypointOnServer` — `@/lib/character/client`
- `MenuItem`, `MenuSubmenu`, `MenuSubmenuTrigger`, `MenuSubmenuContent`, `MenuSeparator` — `@/components/ui/menu`
