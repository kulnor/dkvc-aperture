## LowContrastController

**Purpose:** Applies the persisted low-contrast display preference to the document root after hydration.
**File:** `src/components/LowContrastController.tsx`

### Renders
Nothing (`return null`). Mounted once in the `(app)` layout.

### Behaviour & Interactions
- On mount, reads `readLowContrast()` (`@/lib/lowContrast`) and toggles the `low-contrast` class on `document.documentElement` accordingly.
- Effect-based (post-hydration) on purpose: the server-rendered `<html>` className never carries `low-contrast`, so server and client markup agree — no hydration mismatch and no `suppressHydrationWarning`. The trade-off is a one-frame settle on reload for users who have it enabled.
- The live toggle (map Settings tab) goes through `writeLowContrast`, which both persists and toggles the class immediately; this component only handles the initial-load application.

### Depends On
- `@/lib/lowContrast` — `readLowContrast`.
