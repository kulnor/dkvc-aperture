# Stale & Unscanned Signature Indicators

**Status:** Implemented (single session). Migration `0035_signature_indicators`.

**Goal:** Surface, at a glance on the map, which systems need re-scanning — via small indicators floating off the top-right corner of each system node.

## Context

A scout couldn't tell, without clicking into each system, which systems were stale or unscanned. Two per-node indicators were added:

- **Stale / empty** — clock icon + compact age (e.g. `3h`). Shows when the system's newest signature is older than a threshold, **or** a *wormhole* system has no signatures (k-space empty shows nothing). No indicator when sigs were pasted within the threshold.
- **Unscanned** — signal icon + count. Shows when a system has signatures that aren't fully classified: no group, or a wormhole sig missing its type or its "leads to" connection.

### Decisions (locked with the user)
- Settings are **user-scoped only** (no per-map settings).
- Empty system uses the **same clock icon** as stale, but **only for wormhole systems**.
- Threshold: **global admin default + per-user lower-only override** (capped at the global; no per-map threshold).
- Stale indicator shows **clock icon + age text**. Both indicators can be toggled on/off per account.

## Data model (migration 0035)
- `ap_instance.stale_signature_threshold_minutes` — `integer NOT NULL DEFAULT 240`. Global default; admin-only edit.
- `ap_user.stale_signature_threshold_minutes` — nullable `integer`. Personal override (NULL ⇒ global; capped at global on write).
- `ap_user.show_stale_signature_indicator` / `show_unscanned_signature_indicator` — `boolean NOT NULL DEFAULT true`.

## Key files
- **Pure logic:** `src/lib/map/signatureIndicators.ts` — `summariseSignatures`, `resolveIndicator`, `isUnscanned` (unit-tested).
- **Server reads/resolve:** `src/lib/session.ts` — `getGlobalStaleThresholdMinutes`, `getSignatureIndicatorPrefs` (effective, capped), `getSignatureIndicatorAccountSettings` (raw for the dialog).
- **Mutations:** `setSignatureIndicatorPrefsAction` (`app/(app)/actions/account.ts`, caps override at global); `adminSetStaleSignatureThreshold` (`app/(admin)/actions/settings.ts`, global-admin only via `isAdmin`).
- **Admin UI:** `src/components/admin/StaleThresholdForm.tsx` on `/admin/settings` (global scope only).
- **Account UI:** `src/components/account/AccountSettingsDialog.tsx` — two toggles + "Mark stale after" hours input; threaded through `(app)`/`(admin)` layouts → `AppHeader` → `CharacterPanel`.
- **Client render:** `src/components/map/MapSignatureIndicatorContext.tsx` (store + `useSignatureIndicator`, 60s tick, per-system slice subscriptions mirroring `MapPresenceContext`); rendered by `SystemNode` (`SignatureIndicators`), wired in `MapCanvas`, prefs loaded in the map page.

## Tests
- `tests/unit/signature-indicators.test.ts` — pure summary/resolve logic (14 cases).
- `tests/integration/signature-indicator-prefs.test.ts` — admin global set + member denial, override cap accept/reject, null fallback, defensive cap (RUN_DB_TESTS; snapshots+restores the real `ap_instance` singleton).

## Verification
1. `pnpm db:migrate`; confirm the four columns exist.
2. Open a map: empty wormhole shows a clock (no age); empty k-space shows nothing; paste sigs → clock clears; a sig with no group / a WH missing "leads to" → signal pill with count; lower the override below the sig age → clock + age returns.
3. `/admin/settings` → change global default; account dialog rejects an override larger than it.
