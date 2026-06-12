import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { adminVisibilityScope, isManagerOrAdmin } from '@/lib/auth/rights';
import { loadAuditMap, listAuditActors } from '@/lib/map/audit';
import { MapAuditBrowser } from '@/components/admin/MapAuditBrowser';

function parseMapId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export default async function AdminMapAuditPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId: rawMapId } = await params;
  const mapId = parseMapId(rawMapId);
  if (mapId === null) notFound();

  const session = await auth();
  if (!(await isManagerOrAdmin(session))) redirect('/maps');
  const scope = await adminVisibilityScope(session);
  if (scope === null) redirect('/maps');

  const map = await loadAuditMap(mapId, scope);
  if (!map) notFound();

  const actors = await listAuditActors(mapId);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={{ pathname: '/admin/maps' }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" />
            Back to maps
          </Link>
          <h1 className="text-xl font-semibold">
            Audit — <span className="text-muted-foreground">{map.name}</span>
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">
          Map id <code>{map.id.toString()}</code>
        </span>
      </header>

      <MapAuditBrowser mapId={map.id.toString()} actors={actors} />
    </section>
  );
}
