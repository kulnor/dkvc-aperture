## AccessDeniedPage

**Purpose:** Friendly landing page for a denied EVE sign-in — the `pages.error` target of the Auth.js login gate.
**File:** `src/app/(public)/access-denied/page.tsx`

### Renders
A centred message ("Access not granted") explaining the instance is invite-only, with a `LoginButton` to retry. Styled to match the landing page (`(public)/page.tsx`).

### Behaviour & Interactions
- Reached when the `signIn` callback in `src/lib/auth.ts` returns false; Auth.js redirects here with `?error=AccessDenied`.
- Copy is intentionally generic — it does not disclose whether the instance is `restricted` or the character is simply unlisted.

### Depends On
- `LoginButton` — the retry CTA (`src/components/chrome/LoginButton.tsx`).
