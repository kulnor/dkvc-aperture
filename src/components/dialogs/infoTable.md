## infoTable.tsx

**Purpose:** Shared scroll-table primitives used by the Map info dialog panels and the pilot roster popover — styled table elements, no state.
**File:** `src/components/dialogs/infoTable.tsx`

---

### ScrollTable({ children })
A `max-h-[60vh]` scroll container wrapping a full-width `text-xs` `<table>`. Pass `<thead>`/`<tbody>` as children.

### Th({ className, children })
Left-aligned `<th>` cell with the standard padding/weight. `className` extends.

### Td({ className, children })
`<td>` cell with the standard padding. `className` extends.

### EmptyRow({ children })
Centered muted empty-state block (not a table row — render in place of `ScrollTable`).

---

### Consumed by
- `MapInfoDialog` (Systems / Connections panels)
- `PilotRoster`
