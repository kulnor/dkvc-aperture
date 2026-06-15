'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Crown,
  Search,
  Unplug,
  UsersRound,
} from 'lucide-react';
import { EmptyRow, ScrollTable, Td, Th } from '@/components/dialogs/infoTable';
import { systemClassColor } from '@/components/map/styling';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MapPresenceEntry, MapSystemNode } from '@/types';

/** System class label: the `C<n>`/sec rating, falling back to trueSec then `?`. */
function classLabel(security: string | null, trueSec: number | null): string {
  if (security) return security;
  if (trueSec != null) return trueSec.toFixed(1);
  return '?';
}

/** The pilot's *custom* hull name, or '' when un-renamed (ESI defaults it to the type). */
function customShipName(p: MapPresenceEntry): string {
  return p.shipName && p.shipName !== p.shipTypeName ? p.shipName : '';
}

type SortKey = 'name' | 'location' | 'ship-type' | 'ship-name';
type SortDir = 'asc' | 'desc';
type Sort = { key: SortKey; dir: SortDir };

// Per-browser roster view preferences. The group + show-mains toggles persist so
// the roster keeps your layout across popover open/close and reloads.
const ROSTER_PREFS_KEY = 'aperture:pilot-roster:prefs';

type RosterPrefs = { grouped: boolean; showOwner: boolean };

const DEFAULT_PREFS: RosterPrefs = { grouped: false, showOwner: true };

function loadRosterPrefs(): RosterPrefs {
  try {
    const raw = localStorage.getItem(ROSTER_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<RosterPrefs>;
    return {
      grouped: typeof parsed.grouped === 'boolean' ? parsed.grouped : DEFAULT_PREFS.grouped,
      showOwner: typeof parsed.showOwner === 'boolean' ? parsed.showOwner : DEFAULT_PREFS.showOwner,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function sortValue(p: MapPresenceEntry, key: SortKey): string {
  switch (key) {
    case 'name':
      return p.characterName;
    case 'location':
      return p.systemName ?? String(p.systemId);
    case 'ship-type':
      return p.shipTypeName ?? '';
    case 'ship-name':
      return customShipName(p);
  }
}

function compare(a: MapPresenceEntry, b: MapPresenceEntry, sort: Sort): number {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  // Blank values (no custom ship name, unknown type) always sink to the bottom,
  // regardless of direction — sorting shouldn't float empties to the top.
  if (av === '' && bv !== '') return 1;
  if (bv === '' && av !== '') return -1;
  const base = av.localeCompare(bv) || a.characterName.localeCompare(b.characterName);
  return sort.dir === 'asc' ? base : -base;
}

function matchesQuery(p: MapPresenceEntry, needle: string): boolean {
  if (!needle) return true;
  return [p.characterName, p.mainCharacterName, p.systemName, p.shipTypeName, customShipName(p)].some(
    (v) => v != null && v !== '' && v.toLowerCase().includes(needle),
  );
}

/** One account's rendered cluster in grouped mode. */
type GroupVM = {
  userId: number;
  /** The account main's own roster entry, when the main is online (else null). */
  anchor: MapPresenceEntry | null;
  /** Whether `anchor` is the account main (vs. an unbadged fallback when no main is set). */
  anchorIsMain: boolean;
  /** The main's name for a dimmed label when the main is offline; null if no main is set. */
  mainName: string | null;
  /** Non-anchor members to render indented, in the active sort order. */
  members: MapPresenceEntry[];
  /** Sort key for ordering groups relative to each other. */
  orderKey: string;
};

function pushTo(map: Map<number, MapPresenceEntry[]>, key: number, value: MapPresenceEntry): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildGroups(presence: readonly MapPresenceEntry[], needle: string, sort: Sort): GroupVM[] {
  const allByUser = new Map<number, MapPresenceEntry[]>();
  const matchedByUser = new Map<number, MapPresenceEntry[]>();
  for (const p of presence) {
    pushTo(allByUser, p.userId, p);
    if (matchesQuery(p, needle)) pushTo(matchedByUser, p.userId, p);
  }

  const groups: GroupVM[] = [];
  for (const [userId, matched] of matchedByUser) {
    const first = matched[0];
    if (!first) continue; // every matchedByUser entry has ≥1 member; satisfies the checker
    const all = allByUser.get(userId) ?? matched;
    const mainId = first.mainCharacterId;
    const mainName = first.mainCharacterName;
    // The main is always shown as context when the account has any match — even
    // if the main row itself didn't match the search.
    const onlineMain = mainId === null ? null : (all.find((p) => p.characterId === mainId) ?? null);

    let anchor: MapPresenceEntry | null;
    let anchorIsMain = false;
    let members: MapPresenceEntry[];
    if (onlineMain) {
      anchor = onlineMain;
      anchorIsMain = true;
      members = matched.filter((p) => p.characterId !== mainId);
    } else if (mainName !== null) {
      // Main offline: a dimmed name label anchors the group so its alts don't dangle.
      anchor = null;
      members = matched.filter((p) => p.characterId !== mainId);
    } else {
      // No main set on the account — anchor on the first matched member, unbadged.
      const sorted = [...matched].sort((a, b) => compare(a, b, sort));
      anchor = sorted[0] ?? null;
      members = sorted.slice(1);
    }
    members.sort((a, b) => compare(a, b, sort));

    groups.push({
      userId,
      anchor,
      anchorIsMain,
      mainName: onlineMain ? null : mainName,
      members,
      orderKey: mainName ?? anchor?.characterName ?? members[0]?.characterName ?? '',
    });
  }

  groups.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  return groups;
}

function LocationCell({
  p,
  systemNameById,
}: {
  p: MapPresenceEntry;
  systemNameById: Map<number, MapSystemNode>;
}) {
  // Name + class ride the presence entry (resolved server-side, so they work even
  // when the pilot's system isn't placed on the map). The tag is map-specific, so
  // it comes from the placed node when there is one.
  const tag = systemNameById.get(p.systemId)?.tag ?? null;
  const color = systemClassColor(p.systemSecurity);
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono font-bold" style={{ color }}>
        {classLabel(p.systemSecurity, p.systemTrueSec)}
      </span>
      {tag && (
        <span className="font-mono font-bold" style={{ color }}>
          {tag}
        </span>
      )}
      <span>{p.systemName ?? p.systemId}</span>
    </span>
  );
}

function PilotRow({
  p,
  systemNameById,
  viewerIds,
  indent = false,
  isMain = false,
  showOwner = false,
}: {
  p: MapPresenceEntry;
  systemNameById: Map<number, MapSystemNode>;
  viewerIds: ReadonlySet<number>;
  /** Render as an indented alt beneath its main (grouped mode). */
  indent?: boolean;
  /** Tag the row as the account main. */
  isMain?: boolean;
  /** Annotate an alt row with its main's name (ungrouped mode, where there's no anchor). */
  showOwner?: boolean;
}) {
  // Online (in-game) is what put the pilot on this roster; the icon flags the
  // ones who don't also have the map open in Aperture right now.
  const mapOpen = viewerIds.has(p.characterId);
  // The character belongs to a main other than itself — so its row alone doesn't
  // tell you who the human is.
  const ownerName =
    showOwner && p.mainCharacterId !== null && p.mainCharacterId !== p.characterId
      ? p.mainCharacterName
      : null;
  return (
    <tr className="border-t border-foreground/10">
      <Td>
        <span className={cn('flex items-center gap-1.5')}>
          {indent && (
            <CornerDownRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
          )}
          <span>{p.characterName}</span>
          {ownerName && (
            <span className="text-muted-foreground" title={`Alt of ${ownerName}`}>
              ({ownerName})
            </span>
          )}
          {isMain && (
            <span className="rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">
              main
            </span>
          )}
          {!mapOpen && (
            <span title="Online in-game, but doesn't have this map open in Aperture">
              <Unplug className="size-3.5 text-amber-500" aria-hidden />
            </span>
          )}
        </span>
      </Td>
      <Td>
        <LocationCell p={p} systemNameById={systemNameById} />
      </Td>
      <Td className="text-muted-foreground">{p.shipTypeName ?? '—'}</Td>
      {/* Only the custom hull name; ESI defaults ship_name to the type name, so an
          un-renamed hull reads as no custom name. */}
      <Td className="text-muted-foreground">{customShipName(p) || '—'}</Td>
    </tr>
  );
}

function SortableTh({
  label,
  columnKey,
  sort,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === columnKey;
  return (
    <Th>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="flex items-center gap-1 uppercase transition-colors hover:text-foreground"
      >
        {label}
        {active &&
          (sort.dir === 'asc' ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          ))}
      </button>
    </Th>
  );
}

/**
 * The online-pilot roster table — pilot / location (class-coloured class label +
 * map tag + system) / ship type / custom ship name. Supports clickable column
 * sorting, a free-text filter, and a "group alts under main" toggle that clusters
 * each account's online characters with the main as a labelled anchor and its alts
 * indented beneath. Presence comes from the caller; the tag is resolved against
 * the map's placed nodes.
 */
export function PilotRoster({
  presence,
  systemNameById,
  viewerIds,
}: {
  presence: readonly MapPresenceEntry[];
  systemNameById: Map<number, MapSystemNode>;
  /** Character ids whose account currently has this map open in a live socket. */
  viewerIds: ReadonlySet<number>;
}) {
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' });
  const [query, setQuery] = useState('');
  const [prefs] = useState(loadRosterPrefs);
  const [grouped, setGrouped] = useState(prefs.grouped);
  const [showOwner, setShowOwner] = useState(prefs.showOwner);

  useEffect(() => {
    localStorage.setItem(
      ROSTER_PREFS_KEY,
      JSON.stringify({ grouped, showOwner } satisfies RosterPrefs),
    );
  }, [grouped, showOwner]);

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );

  const needle = query.trim().toLowerCase();

  const flat = useMemo(
    () => presence.filter((p) => matchesQuery(p, needle)).sort((a, b) => compare(a, b, sort)),
    [presence, needle, sort],
  );
  const groups = useMemo(
    () => (grouped ? buildGroups(presence, needle, sort) : []),
    [grouped, presence, needle, sort],
  );

  // Distinct from a filtered-to-empty result: with no tracked pilots online there
  // is nothing to sort or filter, so skip the toolbar entirely.
  if (presence.length === 0) return <EmptyRow>No tracked pilots are online.</EmptyRow>;

  const isEmpty = grouped ? groups.length === 0 : flat.length === 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter pilots…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button
          variant={grouped ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={grouped}
          onClick={() => setGrouped((g) => !g)}
        >
          <UsersRound />
          Group
        </Button>
        <Button
          variant={showOwner && !grouped ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={showOwner}
          disabled={grouped}
          title={grouped ? 'Mains are shown as group anchors' : "Show each alt's main"}
          onClick={() => setShowOwner((s) => !s)}
        >
          <Crown />
          Mains
        </Button>
      </div>

      {isEmpty ? (
        <EmptyRow>No pilots match your filter.</EmptyRow>
      ) : (
        <ScrollTable>
          <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase text-muted-foreground">
            <tr>
              <SortableTh label="Pilot" columnKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Location" columnKey="location" sort={sort} onSort={onSort} />
              <SortableTh label="Type" columnKey="ship-type" sort={sort} onSort={onSort} />
              <SortableTh label="Ship" columnKey="ship-name" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {grouped
              ? groups.flatMap((g) => {
                  const rows: ReactElement[] = [];
                  if (g.anchor) {
                    rows.push(
                      <PilotRow
                        key={g.anchor.characterId}
                        p={g.anchor}
                        systemNameById={systemNameById}
                        viewerIds={viewerIds}
                        isMain={g.anchorIsMain}
                      />,
                    );
                  } else if (g.mainName !== null) {
                    // Main offline: a dimmed name label so the indented alts read as
                    // belonging to a (currently absent) main.
                    rows.push(
                      <tr key={`main-${g.userId}`} className="border-t border-foreground/10">
                        <Td className="text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="italic">{g.mainName}</span>
                            <span className="rounded bg-muted px-1 text-[9px] font-semibold uppercase">
                              main · offline
                            </span>
                          </span>
                        </Td>
                        <Td>{null}</Td>
                        <Td>{null}</Td>
                        <Td>{null}</Td>
                      </tr>,
                    );
                  }
                  for (const m of g.members) {
                    rows.push(
                      <PilotRow
                        key={m.characterId}
                        p={m}
                        systemNameById={systemNameById}
                        viewerIds={viewerIds}
                        indent
                      />,
                    );
                  }
                  return rows;
                })
              : flat.map((p) => (
                  <PilotRow
                    key={p.characterId}
                    p={p}
                    systemNameById={systemNameById}
                    viewerIds={viewerIds}
                    showOwner={showOwner}
                  />
                ))}
          </tbody>
        </ScrollTable>
      )}
    </div>
  );
}
