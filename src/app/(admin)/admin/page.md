## AdminDashboardPage

**Purpose:** Index page of the admin panel. Renders five global count cards as a snapshot at request time.
**File:** `src/app/(admin)/admin/page.tsx`

### Renders
A header plus a responsive grid of five `StatCard`s (all global — `/admin` is operator-only):

- **Active maps** — `ap_map` where `deleted_at IS NULL`.
- **Soft-deleted maps** — `ap_map` where `deleted_at IS NOT NULL`.
- **Kicked characters** — `ap_character` where `status='kicked'`.
- **Banned characters** — `ap_character` where `status='banned'`.
- **Failing webhooks** — `ap_map_webhook` where `consecutive_failures > 0`.

### Behaviour & Interactions
- `auth()` then `isAdmin(session)`; non-admin redirects to `/maps` (defence in depth — the layout already gated the route).
- Counts run in parallel with `Promise.all`. No realtime — the admin layout deliberately omits `RealtimeProvider`.

### Depends On
- `auth` from `@/lib/auth`; `isAdmin` from `@/lib/auth/rights`.
- Drizzle: `apMap`, `apCharacter`, `apMapWebhook` from `@/db/schema`.
