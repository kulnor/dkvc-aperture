## AccountSettingsDialog

**Purpose:** Account self-service dialog — pick the account's main character (with per-character role display), toggle preferences (travel animation, signature indicators), and reach account deletion.
**File:** `src/components/account/AccountSettingsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter (owned by `CharacterPanel`) |
| characters | AccountCharacter[] | yes | The account roster (`id`, `name`, `status`, `authzLevel`) |
| mainCharacterId | string \| null | yes | Current main; `null` until bootstrapped on first login |
| activeCharacter | { id: string; name: string } | yes | The signed-in character; its name is the delete confirmation phrase |
| travelAnimation | boolean | yes | Initial state of the connection-travel-animation toggle |
| signatureIndicators | SignatureIndicatorAccountSettings | yes | Global cap + the account's override (`null` = use default) + the two toggles |

### Renders
A roster list — each row shows portrait, name, role label (Member / Manager / Admin), and either a "Main" marker (current main), the kicked/banned status, or a "Set as main" button. Below it, a "Show connection travel animation" checkbox row, a "Signature indicators" section (two toggles + a "Mark stale after" hours input), then a destructive-bordered "Delete account" section embedding `DeleteAccountDialog`.

### Behaviour & Interactions
- `mainId` is local optimistic state seeded from `mainCharacterId`; clicking "Set as main" calls `setMainCharacterAction` in a transition and moves the marker on success, toasting on failure.
- Only `active` characters that aren't already main are selectable; the in-flight transition disables all set-main buttons.
- `travelOn` is local optimistic state seeded from `travelAnimation`; toggling the checkbox calls `setConnectionTravelAnimationAction` in a transition, reverting + toasting on failure. Both transitions share the one `pending` flag.
- Signature-indicator prefs (`showStale`, `showUnscanned`, `thresholdHours`) are local optimistic state. `commitSigPrefs(next)` persists all three at once (the action takes the full set): the hours field is parsed, clamped client-side to `[1 min, globalThresholdMinutes]`, converted to minutes (blank ⇒ `null` = use default), then sent via `setSignatureIndicatorPrefsAction`; failure rolls all three back and toasts. The threshold input is disabled when `showStale` is off. Server re-validates the cap.

### Emits / Calls
- `setMainCharacterAction(id)`, `setConnectionTravelAnimationAction(enabled)`, `setSignatureIndicatorPrefsAction({ thresholdMinutes, showStale, showUnscanned })` — from `@/app/(app)/actions/account`

### Depends On
- `DeleteAccountDialog` — the type-to-confirm deletion flow
- `Dialog`, `Avatar`, `Button` UI primitives

### Exports
- `AccountCharacter` type — `{ id; name; status; authzLevel }`, the roster row shape.
