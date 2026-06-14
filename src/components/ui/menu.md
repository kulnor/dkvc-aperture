## menu.tsx

**Purpose:** Minimal Base UI dropdown-menu wrapper (the parts the header Info menu and the map context menu need).
**File:** `src/components/ui/menu.tsx`

`'use client'`. Thin wrappers over `@base-ui/react/menu`, matching the `data-slot` + styling conventions of `select.tsx`.

### Exports
- `Menu` — `MenuPrimitive.Root`.
- `MenuTrigger` — `MenuPrimitive.Trigger` (use the Base UI `render={…}` prop to project a `Button`).
- `MenuContent` — Portal + Positioner (`sideOffset={4}`, `align="end"`) + styled Popup.
- `MenuItem` — styled `MenuPrimitive.Item`; highlight + disabled states wired via `data-*` attributes. Extra props: `inset?: boolean` reserves the same left gutter (`pl-7`) as checkbox/radio items so plain-row text aligns with toggle text; `icon?: ReactNode` renders a leading icon absolutely positioned in that gutter (implies the gutter, so the icon's text still aligns) instead of inline.
- `MenuSubmenu` — `MenuPrimitive.SubmenuRoot`; wraps a submenu trigger + content pair.
- `MenuSubmenuTrigger` — styled `MenuPrimitive.SubmenuTrigger` (looks like `MenuItem`) with a trailing `ChevronRightIcon` pushed right via `ml-auto`; also highlights on `data-[popup-open]`. Extra props: `inset?: boolean` reserves the `pl-7` left gutter so the label aligns with toggle text; `icon?: ReactNode` renders a leading icon absolutely positioned in that gutter (implies the gutter).
- `MenuSubmenuContent` — Portal + Positioner (`side="right"`, `align="start"`, `sideOffset={4}`) + styled Popup (same className as `MenuContent`).
- `MenuRadioGroup` — `MenuPrimitive.RadioGroup`; holds the controlled `value` / `onValueChange` for single-select enum submenus.
- `MenuRadioItem` — styled `MenuPrimitive.RadioItem` with a left-anchored `RadioItemIndicator` (`CheckIcon`) so the active value shows a checkmark (`pl-7` to clear the indicator).
- `MenuCheckboxItem` — styled `MenuPrimitive.CheckboxItem` with a left-anchored `CheckboxItemIndicator` (`CheckIcon`) for boolean toggles; takes `checked` / `onCheckedChange`.
- `MenuSeparator` — styled `MenuPrimitive.Separator` (`-mx-1 my-1 h-px bg-border`).
- `MenuGroupLabel` — styled `MenuPrimitive.GroupLabel` (`px-2 py-1 text-[10px] text-muted-foreground`) for optional submenu headers.
