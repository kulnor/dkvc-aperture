## schema.ts

**Purpose:** Zod boundary validator for the user-supplied map dashboard layout JSON before it lands in `ap_user.map_layout`.
**File:** `src/lib/map/layout/schema.ts`

---

### mapLayoutConfigSchema
Zod schema for `MapLayoutConfig`. Validates `version` (int 0..1_000_000), `layouts` (an object with `lg`/`md`/`sm` keys, each an array of ≤50 layout items), and `hidden` (an array of ≤50 `PanelId`s). Each layout item is `{ i: PanelId; x; y; w; h; minW?; minH? }` with bounded integer coordinates (`x`/`y` 0..1000) and spans (`w`/`h` 1..1000). `i` is constrained to the `PanelId` enum (derived from `PANELS`). Unknown item keys (RGL's `static`, `moved`, `maxW`, …) are stripped — only the minimal geometry is persisted. Used by `setMapLayoutAction` (`actions/account.ts`) via `safeParse`.

### ParsedMapLayout (type)
`z.infer<typeof mapLayoutConfigSchema>`. A module-level conditional-type assertion guarantees it is assignable to `MapLayoutConfig` (`src/types/index.ts`).
