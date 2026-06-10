# In-Game System Overlay (Document Picture-in-Picture)

**Goal:** A read-only, always-on-top floating panel — popped out of the open map page via the Document Picture-in-Picture API — showing the active character's current system (class + tag prominent, name secondary), who else is in that system and what they're flying, and the wormhole/gate/bridge connections out of it with mass/EOL state.

**References:** `MapCanvas.md`, `MapPresenceContext` (`usePresenceForSystem`/`usePresenceForMap`), `MapActiveCharContext` (`useMapActiveChar`), `PilotRosterButton.tsx` (toolbar-control precedent), `styling.ts` (`systemClassColor`, `connectionStyle`, `connectionBadges`, `useEolCountdown`), `loadMap.ts` types (`MapPresenceEntry`, `MapSystemNode`, `MapConnectionEdge`, `MapViewData`). CLAUDE.md: companion `.md` standing instruction; UI primitives (lucide, shadcn); types live in `src/types/index.ts`.

---

## Context

A user requested an in-game overlay (compared to the Mumble talker overlay) showing current system, friendly pilots + their ships, and available connections. The data is already a subset of what the map page holds; the only new problem is surfacing it in a floating, always-on-top window over the EVE client.

**Key decision — Document PiP, not a native shell or a separate route.** The Document Picture-in-Picture API (`window.documentPictureInPicture`, Chromium 116+) pops live DOM into an OS-level always-on-top window with zero install. Crucially, a subtree rendered into that window via `createPortal` **stays part of the same React tree**, so it keeps live access to the providers already wrapping the map toolbar. That means:

- **No new realtime subscription, no new data load, no duplicated connection-state reducer.** The overlay reads the exact `viewData`, presence store, and active-character context that `MapCanvas` already maintains.
- The overlay is **read-only**, which sidesteps the two classic PiP-with-React footguns: no click-through needed (you glance, you don't click — the Mumble model), and React synthetic events don't cross documents anyway (irrelevant with no handlers).
- A separate `/overlay` route would gain nothing: Document PiP already requires its opener tab to stay open (closing the opener closes the PiP), so isolating it would only duplicate state. Rejected.

**Scope confirmed with user:** pilot list **excludes self**; rows are **text-only** (no portraits/icons); connections include **wormholes, stargates, jumpbridges** but **not abyssal** (`scope !== 'abyssal'`).

**Constraint to document (not code):** PiP composites over EVE only in **borderless/windowed** mode, never exclusive fullscreen — a property of the Windows compositor, true of any non-injecting overlay. Chromium-only; other browsers get a disabled button + tooltip.

---

## Approach

Add a toolbar control to `MapCanvas`, mirroring `PilotRosterButton`, that opens/closes a PiP window and portals the overlay into it. All three new pieces live inside the existing provider nesting (the toolbar is already inside `MapPresenceProvider` + `MapActiveCharProvider`), so the portalled content can call the existing hooks directly.

### New files (each needs a companion `.md` written in the same operation)

1. **`src/lib/realtime/useDocumentPip.ts`** (+ `.md`) — small client hook owning the PiP window lifecycle. *(Place under a UI util dir if preferred, e.g. `src/components/map/`; not realtime-specific — final location is the implementer's call, just keep it colocated with its companion.)*
   - `isSupported`: `typeof window !== 'undefined' && 'documentPictureInPicture' in window`.
   - `open({ width, height })`: `await window.documentPictureInPicture.requestWindow(...)`; then **clone styles** — copy every `<style>` and `<link rel="stylesheet">` from `document.head` into `pipWindow.document.head` (Tailwind v4 injects via `document.head`; dev = `<style>`, prod = `<link>`), and **mirror the theme**: copy `document.documentElement.className` (the `.dark` custom-variant class) onto `pipWindow.document.documentElement`. Set `body` background to the app's dark surface so transparent gaps don't flash white.
   - Track the window in state; wire its `pagehide` event to clear state (covers the user closing the PiP chrome). Close on `unmount` and on explicit `close()`.
   - Returns `{ pipWindow, isOpen, isSupported, open, close }`.

2. **`src/components/map/SystemOverlay.tsx`** (+ `.md`) — the read-only panel content (rendered via portal). Props: `{ viewData: MapViewData }`. Reads `useMapActiveChar()` for `activeCharSystemId` and `usePresenceForSystem(activeCharSystemId)` for the roster.
   - **Header (current system):** resolve the `MapSystemNode` in `viewData.systems` where `systemId === activeCharSystemId`.
     - Primary line (large): **class** (colored via `systemClassColor(node.security)`) + **tag** (`node.tag`, colored). Class/tag lead because the system name is already visible in-game.
     - Secondary line (small, muted): system name / alias (`node.alias ?? node.name`).
     - Off-map fallback: if the active char's system has no node (not placed on the chain), fall back to the presence entry's `systemSecurity`/`systemName` for class+name; no tag, no connections section.
   - **Pilots in system (excludes self):** `usePresenceForSystem(activeCharSystemId)` filtered to `characterId !== activeCharId`. One compact text row each: `characterName` · `shipTypeName` (and `shipName` only when it differs, mirroring `PilotRoster`'s rule). Empty state: "Alone in system". Re-renders live off the presence store's `characterUpdate` folding — no extra wiring.
   - **Connections out:** find the current system's node id, filter `viewData.connections` to those incident (`source === nodeId || target === nodeId`) **and** `scope !== 'abyssal'`. Each thin row: far-end system (resolve the other node → `systemClassColor` + tag/name), a mass dot colored by `massStatus` (reuse the fresh/reduced/critical color logic in `connectionStyle`), and an EOL indicator via `connectionBadges` / `useEolCountdown` when `eolStage !== 'none'`. Static/rolling/preserve badges optional, low priority.
   - Compact, low-chrome styling; no interactivity, no tooltips (events don't cross the PiP document).

3. **`src/components/map/SystemOverlayButton.tsx`** (+ `.md`) — toolbar control modeled on `PilotRosterButton`.
   - Ghost `Button` with an icon (e.g. `PictureInPicture2` from lucide) labeled e.g. "Overlay".
   - Uses `useDocumentPip()`. Click toggles `open`/`close`. When `!isSupported`, render the button **disabled** with a tooltip explaining Chromium-only.
   - While `pipWindow` is set, render `createPortal(<SystemOverlay viewData={viewData} />, pipWindow.document.body)`. Because this component sits in the toolbar (inside both providers), the portalled child resolves `usePresenceForSystem` / `useMapActiveChar` correctly.

### Wired into existing files

4. **`src/components/map/MapCanvas.tsx`** (+ update `MapCanvas.md`) — add `<SystemOverlayButton viewData={viewData} />` to the right-aligned toolbar cluster, next to `PilotRosterButton`. One JSX line + import. No other changes; it reuses `viewData` already in scope and the providers already wrapping the toolbar.

### Reused, do not rebuild
- `usePresenceForSystem(systemId)` / `usePresenceForMap()` — `src/components/map/MapPresenceContext.tsx`
- `useMapActiveChar()` → `activeCharId`, `activeCharSystemId` — `src/components/map/MapActiveCharContext.tsx`
- `systemClassColor`, `connectionStyle`, `connectionBadges`, `useEolCountdown` — `src/components/map/styling.ts`
- Types from `src/types/index.ts`: `MapViewData`, `MapSystemNode`, `MapConnectionEdge`, `MapPresenceEntry`
- Field-display precedent (ship name vs type, class coloring) — `src/components/map/PilotRoster.tsx`

### No backend changes
No new route, server action, DB column, migration, or realtime task. The feature is a pure client-side projection of state the map page already holds.

---

## Edge cases
- **No active/located character** (`activeCharSystemId == null`): overlay shows a neutral "No tracked character located" placeholder; button still opens the window.
- **Active char in an off-map system:** header from presence entry, connections section hidden (see Header fallback above).
- **Unsupported browser:** button disabled + tooltip; never throws.
- **PiP closed via its own window chrome:** `pagehide` clears hook state so the toolbar button returns to the "open" affordance.
- **Theme/stylesheet refresh:** styles are cloned at open time; a full re-theme mid-session is out of scope (close/reopen picks up changes).

---

## Verification
- `pnpm lint && pnpm typecheck && pnpm build` green (companion `.md` files updated for every new/changed `.ts`/`.tsx`).
- Manual (Chromium): open a map with a tracked, located character → click **Overlay** → a floating window appears showing the current system's class+tag header, other pilots in system with ships, and non-abyssal connections with mass/EOL state.
- Move a tracked alt into/out of that system (or simulate a `characterUpdate`) → the pilot list updates live in the PiP window without reopening it.
- Change a connection's mass/EOL on the map → the overlay's connection row reflects it live.
- Drag the PiP window over a borderless EVE client → it stays on top.
- Confirm the button is disabled with an explanatory tooltip in a non-Chromium browser.
- Close the PiP via its own ✕ → toolbar button resets to "open".

## Out of scope (future)
- Native Tauri/Electron shell for click-through + true always-on-top polish (the `SystemOverlay` component is the reusable asset; only the host window changes).
- Per-overlay character picker (overlay follows the map-level active-character selection).
