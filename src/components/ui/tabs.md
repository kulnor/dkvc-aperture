## tabs.tsx

**Purpose:** Thin styled wrapper over `@base-ui/react/tabs` providing the project's tab strip primitive.
**File:** `src/components/ui/tabs.tsx`

---

### Tabs(props: TabsPrimitive.Root.Props)
Root container. Controlled via `value` / `onValueChange`, or uncontrolled via `defaultValue` (defaults to `0`). Lays children out in a vertical flex column. Carries `min-w-0` so it never blows past a constrained parent (e.g. a `max-w-*` grid dialog) when many tabs are present.

### TabsList(props: TabsPrimitive.List.Props)
The horizontal tab-button strip with a bottom border the selected tab's indicator sits on. Scrolls horizontally (`overflow-x-auto`) when the tabs exceed the available width; being a scroll container also zeroes its automatic min-width, which is what keeps a tab-heavy dialog from overflowing its container. `overflow-y` is pinned to `hidden` so the tabs' `-mb-px` underline overlap can't turn into a stray vertical scroll once the horizontal scrollbar appears.

### TabsTab(props: TabsPrimitive.Tab.Props)
An individual tab button. Requires a `value` matching its panel. Muted when inactive; gains a primary bottom-border + foreground text when `data-selected`. `shrink-0` so labels keep their width and the strip scrolls rather than squashing.

### TabsPanel(props: TabsPrimitive.Panel.Props)
Content panel shown when the `Tab` with the matching `value` is active. Hidden (unmounted) otherwise unless `keepMounted` is set.

---

Used by `MapInfoDialog` (Summary / Systems / Connections / Users). Intended for reuse by other dialogs (account settings, statistics).
