## popover.tsx

**Purpose:** Thin `@base-ui/react/popover` wrapper providing the project's popover surface — non-modal by default (no backdrop / focus trap), so content underneath stays interactive.
**File:** `src/components/ui/popover.tsx`

---

### Popover(props)
Re-export of `Popover.Root`. Controlled/uncontrolled open state lives here; the `Trigger` toggles open↔closed on each press.

### PopoverTrigger(props)
Re-export of `Popover.Trigger`. Use the base-ui `render` prop to project a `Button` (same pattern as `MenuTrigger`).

### PopoverContent({ className, children, ...props })
`Portal → Positioner (sideOffset 4, align "end") → Popup`. Applies the shared popover surface classes (`rounded-lg border bg-popover ... shadow-md`, `z-50`, `data-starting/ending-style` fade) matching `MenuContent`. `className` extends the Popup; remaining props spread onto the Popup.

---

### Depends On
- `@base-ui/react/popover`
- `cn` from `@/lib/utils`
