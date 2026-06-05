import { bigserial, boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Per-invocation telemetry for the graphile-worker tasks. Written by
// `withInstrumentation` (src/lib/jobs/withInstrumentation.ts)
// around every handler call: one row inserted at start, finalised at end with
// success/error/notes. Surfaces per-job success metrics.
//
// graphile-worker's own tables live in the `graphile_worker` schema and are
// managed by its `runMigrations` API on first boot — those track queued/locked
// jobs, not historical outcomes. This table is the historical record we keep.
export const apJobRun = pgTable(
  'ap_job_run',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    name: text('name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    success: boolean('success'),
    errorText: text('error_text'),
    notes: jsonb('notes'),
  },
  (t) => [index('ap_job_run_name_started_at_idx').on(t.name, t.startedAt.desc())],
);
