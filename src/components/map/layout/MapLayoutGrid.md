## MapLayoutGrid

**Purpose:** Thin wrapper around react-grid-layout's `Responsive` grid that supplies container-width measurement, the project's breakpoints/cols, the header-only drag handle, and a mount guard.
**File:** `src/components/map/layout/MapLayoutGrid.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| layouts | Record<Breakpoint, Layout> | yes | Per-breakpoint arrangements; each item's `i` matches a child's `key` |
| onLayoutChange | (current: Layout, all: ResponsiveLayouts<Breakpoint>) => void | yes | Fired by RGL on every drag/resize with the active and all-breakpoint layouts |
| children | ReactNode | yes | One element per visible panel, each keyed by its `PanelId` |

### Renders
A full-size wrapper `div` holding either the live `Responsive` grid (once measured) or a plain vertical stack of `children` (first paint, before width is known).

### Behaviour & Interactions
- Width comes from RGL's `useContainerWidth` (ResizeObserver) — no `WidthProvider`, SSR-safe. `mounted` gates the grid to avoid a hydration flash; the stacked fallback renders until then.
- `dragConfig={{ handle: '.ap-panel-drag', cancel: '.nodrag' }}` — only `MapPanel` headers start a drag; controls marked `nodrag` are excluded.
- `rowHeight` 40px, `margin` [8, 8]px. Breakpoints/cols come from `PANEL_BREAKPOINTS` / `PANEL_COLS`.
- Re-applies `PANEL_MIN` (registry resize floors) over each stored layout item before handing `layouts` to RGL, so the registry `minW`/`minH` stay authoritative — lowering a floor takes effect for already-saved layouts without altering their persisted `x/y/w/h`.
- Imports `react-grid-layout/css/styles.css` for the grid item / resize-handle positioning.
- Stateless: holds no layout state itself; the parent owns `layouts` and persists via `onLayoutChange`.

### Depends On
- `react-grid-layout` (`Responsive`, `useContainerWidth`, `Layout`, `ResponsiveLayouts`).
- `PANEL_BREAKPOINTS` / `PANEL_COLS` / `PANEL_MIN` from `@/lib/map/layout/panels`.
- `PANEL_DRAG_HANDLE_CLASS` / `PANEL_NO_DRAG_CLASS` from `./MapPanel`.
