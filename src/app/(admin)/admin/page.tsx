import { redirect } from 'next/navigation';
import { count, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter, apMap, apMapWebhook } from '@/db/schema';
import { isAdmin } from '@/lib/auth/rights';
import { auth } from '@/lib/auth';

async function countMaps(deleted: boolean): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apMap)
    .where(deleted ? isNotNull(apMap.deletedAt) : isNull(apMap.deletedAt));
  return row?.n ?? 0;
}

async function countCharacters(status: 'kicked' | 'banned'): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apCharacter)
    .where(eq(apCharacter.status, status));
  return row?.n ?? 0;
}

async function countFailingWebhooks(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apMapWebhook)
    .where(gt(apMapWebhook.consecutiveFailures, 0));
  return row?.n ?? 0;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!(await isAdmin(session))) redirect('/maps');

  const [activeMaps, deletedMaps, kicked, banned, failingWebhooks] = await Promise.all([
    countMaps(false),
    countMaps(true),
    countCharacters('kicked'),
    countCharacters('banned'),
    countFailingWebhooks(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active maps" value={activeMaps} />
        <StatCard label="Soft-deleted maps" value={deletedMaps} />
        <StatCard label="Kicked characters" value={kicked} />
        <StatCard label="Banned characters" value={banned} />
        <StatCard label="Failing webhooks" value={failingWebhooks} />
      </div>
    </section>
  );
}
