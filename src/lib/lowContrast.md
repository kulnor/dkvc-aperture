## lowContrast.ts

**Purpose:** Client-only low-contrast display preference — persisted to localStorage and applied as a `low-contrast` class on the document root that the dark-theme overrides in `globals.css` key off.
**File:** `src/lib/lowContrast.ts`

---

### LOW_CONTRAST_KEY
The localStorage key (`'aperture:low-contrast'`). Value is `'1'` (on) / `'0'` (off); absent ⇒ off.

---

### readLowContrast(): boolean
Reads the stored preference. Returns `true` only when the key is exactly `'1'`; defaults to `false` (including when localStorage is unavailable).

**Returns:** Whether low-contrast mode is enabled.

---

### writeLowContrast(enabled: boolean): void
Persists the preference to localStorage and toggles the `low-contrast` class on `document.documentElement` so the change applies live. Swallows localStorage write errors but still toggles the class.

**Parameters:**
- `enabled` — the new preference value.

---

**Note:** `LowContrastController` (mounted in the `(app)` layout) calls `readLowContrast` on mount to apply the class on initial load; this module's `writeLowContrast` is the live read/write path used by the Settings tab toggle in `MapSettingsDialog`. The `.dark.low-contrast` overrides live in `globals.css`.
