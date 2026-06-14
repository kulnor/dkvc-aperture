## signatureReap.ts

**Purpose:** Cron task that deletes expired in-game scan signatures (`ap_map_signature.expires_at < now()`), excluding soft-deleted maps.
**File:** `src/lib/jobs/tasks/signatureReap.ts`

---

### signatureReap: JobModule
- `name`: `'signature-reap'`
- `cron`: `'*/30 * * * *'` (every 30 minutes).
- `run`: `withInstrumentation('signature-reap', reap)`.

### reap(): { scanned, deleted, failed }
Selects up to `JOB_DELETE_BATCH_SIZE` expired signature rows on non-soft-deleted maps via `ap_map_signature → ap_map_system → ap_map`. For each row, calls `commitMapEvent` with `kind: 'signature.delete'`, `characterId: null` (system-initiated); the delete's `RETURNING` carries `mapSystemId` + `sigId` into the payload (audit descriptors) so the reap entry names the removed sig. The trigger fires `pg_notify`, the bus forwards it as `mapUpdate`, client tabs apply the disappearance the same way they'd handle a user delete.

Per-row transactions: one bad row never blocks the rest. The counts land in `ap_job_run.notes`.

### Notes
- Signature expiry is purely about `expires_at`; `ap_map_system.visible` is the system lifecycle flag and plays no part in reaping.
- Signatures bound to a connection cascade-delete when that connection collapses, so the reaper only sees sigs whose `expires_at` arrives before any owning wormhole dies.
