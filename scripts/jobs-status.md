## jobs-status.ts

**Purpose:** CLI entry point (`pnpm jobs:status`) that prints a per-task table over the last 7 days of `ap_job_run`. Backs the background-job "one-week soak" check.
**File:** `scripts/jobs-status.ts`

Loads `.env` via `@next/env`, walks `jobModules()` (the job registry), calls `summary(name, 168h)` per task, and renders:

```
TASK                       CRON           LAST RUN  RUNS  OK  FAIL  ABNDND  AVG     FLAGS
signature-reap             */30 * * * *   2m ago    336  336    0       0  47ms
…
```

Trailing diagnostic lines surface registry drift:
- **"Tasks with rows but not in registry"** — rows in `ap_job_run` whose name isn't in `jobModules()`. Usually a rename whose old row history was never pruned.
- **"Tasks registered but never run"** — registered task that's never produced an `ap_job_run` row. Either the cron hasn't fired yet or the worker isn't booted.

Flags column:
- `ABANDONED:N` — `N` runs have `ended_at IS NULL` (worker died mid-handler).
- `LAST:FAIL` — most recent run threw.

### Configuration
- `JOBS_STATUS_SINCE_HOURS` env var overrides the 168h (7d) window.

### Why a CLI instead of an admin page
A CLI reads `ap_job_run` directly and is enough for the one-week soak, without standing up a dedicated admin UI for it.
