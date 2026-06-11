# Signature Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global signature search modal to the map canvas that filters all on-map signatures client-side and navigates to the matching system when a result is actioned.

**Architecture:** Filter state lives in `MapCanvas` alongside existing dialog state (`mapInfoOpen`, `settingsOpen`) so filters persist between opens. All filtering and sorting is a pure function over `viewData.signatures` + `viewData.systems` — no server fetch. The navigate action selects the system on the canvas, centers the viewport, and flashes the matching signature row in `SignatureModule` for 3 seconds via a CSS animation class.

**Tech Stack:** React 19, TypeScript, TanStack Table (already used in `SignatureModule`), xyflow `ReactFlowInstance.fitView`, Vitest (unit tests), Tailwind CSS / shadcn/ui.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `src/types/index.ts` | Add `SigSearchFilters` export |
| Create | `src/lib/map/sigSearch.ts` | Pure `buildSigSearchResults` function + exported types |
| Create | `src/lib/map/sigSearch.md` | Companion doc |
| Create | `tests/sigSearch.test.ts` | Unit tests for filter/sort logic |
| Modify | `src/app/globals.css` | Add `@keyframes ap-sig-flash` + `.ap-sig-flash` class |
| Modify | `src/components/sidebar/SignatureModule.tsx` | Add `flashSigId` prop to `SignatureModule` + `SignaturePanelBody`; add `onOpenSearch` prop to `SignatureModuleHeaderActions` |
| Modify | `src/components/sidebar/SignatureModule.md` | Update companion |
| Create | `src/components/dialogs/SignatureSearchDialog.tsx` | New dialog component |
| Modify | `src/components/dialogs/SignatureSearchDialog.md` | Finalise companion (file already exists) |
| Modify | `src/components/map/MapCanvas.tsx` | State, toolbar button, `onNavigate`, dialog mount, `flashSigId` wiring |

---

## Task 1: `SigSearchFilters` type + pure filter utility + unit tests

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/map/sigSearch.ts`
- Create: `src/lib/map/sigSearch.md`
- Create: `tests/sigSearch.test.ts`

- [ ] **Step 1: Add `SigSearchFilters` to `src/types/index.ts`**

Append at the end of the file (after the `MapContextMenuTarget` block):

```ts
/** Filter state for `SignatureSearchDialog`. Owned by `MapCanvas` so it persists between opens. */
export type SigSearchFilters = {
  name: string;
  groupKey: SignatureGroupKey | null;
  maxAgeHours: number | null;
  /** `MapSystemNode.security` labels to include; empty = all. */
  securityClasses: string[];
};
```

`SignatureGroupKey` is already imported/exported earlier in `src/types/index.ts`.

- [ ] **Step 2: Create `src/lib/map/sigSearch.ts`**

```ts
import type { MapSignature, MapSystemNode, SigSearchFilters } from '@/types';

export type SigSearchRow = {
  sig: MapSignature;
  system: MapSystemNode;
  ageMs: number;
};

export type SigSortField = 'sigId' | 'systemName' | 'age';
export type SigSortDir = 'asc' | 'desc';

/**
 * Filters and sorts `signatures` against `filters`, joining each to its parent
 * system. Signatures whose `mapSystemId` is not in `systems` are dropped.
 * `now` is a Unix-epoch ms value (pass `Date.now()`).
 */
export function buildSigSearchResults(
  signatures: MapSignature[],
  systems: MapSystemNode[],
  filters: SigSearchFilters,
  sortField: SigSortField,
  sortDir: SigSortDir,
  now: number,
): SigSearchRow[] {
  const systemMap = new Map(systems.map((s) => [s.id, s]));
  const nameLower = filters.name.trim().toLowerCase();

  const rows: SigSearchRow[] = [];
  for (const sig of signatures) {
    const system = systemMap.get(sig.mapSystemId);
    if (!system) continue;

    if (nameLower && !(sig.name?.toLowerCase().includes(nameLower) ?? false)) continue;
    if (filters.groupKey !== null && sig.groupKey !== filters.groupKey) continue;
    if (
      filters.securityClasses.length > 0 &&
      !filters.securityClasses.includes(system.security ?? '')
    )
      continue;

    const ageMs = now - new Date(sig.createdAt).getTime();
    if (filters.maxAgeHours !== null && ageMs > filters.maxAgeHours * 3_600_000) continue;

    rows.push({ sig, system, ageMs });
  }

  rows.sort((a, b) => {
    let cmp = 0;
    if (sortField === 'sigId') {
      cmp = a.sig.sigId.localeCompare(b.sig.sigId);
    } else if (sortField === 'systemName') {
      const aName = a.system.alias ?? a.system.name;
      const bName = b.system.alias ?? b.system.name;
      cmp = aName.localeCompare(bName);
    } else {
      cmp = a.ageMs - b.ageMs;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return rows;
}
```

- [ ] **Step 3: Create `src/lib/map/sigSearch.md`**

```markdown
## sigSearch.ts

**Purpose:** Pure client-side filter + sort over map signatures for `SignatureSearchDialog`.
**File:** `src/lib/map/sigSearch.ts`

---

### buildSigSearchResults(signatures, systems, filters, sortField, sortDir, now): SigSearchRow[]
Filters `signatures` by name (partial, case-insensitive, against `sig.name`), `groupKey`, max age in hours (against `sig.createdAt`), and security class (against `system.security`). Joins each surviving sig to its parent `MapSystemNode`; sigs with no matching system are dropped. Sorts by `sigId` / `systemName` / `age` in the requested direction. `now` is a Unix-epoch ms value.

**Returns:** `SigSearchRow[]` — `{ sig, system, ageMs }` ordered per `sortField`/`sortDir`.

---

### Types
- `SigSearchRow` — `{ sig: MapSignature; system: MapSystemNode; ageMs: number }`
- `SigSortField` — `'sigId' | 'systemName' | 'age'`
- `SigSortDir` — `'asc' | 'desc'`
```

- [ ] **Step 4: Write failing tests in `tests/sigSearch.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSigSearchResults } from '@/lib/map/sigSearch';
import type { MapSignature, MapSystemNode, SigSearchFilters } from '@/types';

const NOW = new Date('2026-06-11T12:00:00Z').getTime();

function makeSig(
  overrides: Partial<MapSignature> & { id: string; sigId: string; mapSystemId: string; createdAt: string },
): MapSignature {
  return {
    mapConnectionId: null,
    groupKey: null,
    typeId: null,
    wormholeCode: null,
    name: null,
    description: null,
    expiresAt: new Date(NOW + 86_400_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function makeSystem(
  overrides: Partial<MapSystemNode> & { id: string; name: string },
): MapSystemNode {
  return {
    systemId: 30_000_001,
    alias: null,
    tag: null,
    intelNotes: null,
    status: 'unknown',
    security: 'C3',
    trueSec: null,
    effect: null,
    regionName: 'A-R00001',
    constellationName: 'A-C00001',
    statics: [],
    tradeHub: null,
    locked: false,
    rallyAt: null,
    positionX: 0,
    positionY: 0,
    ...overrides,
  };
}

const BASE: SigSearchFilters = {
  name: '',
  groupKey: null,
  maxAgeHours: null,
  securityClasses: [],
};

describe('buildSigSearchResults', () => {
  it('returns all rows when filters are empty', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const a = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW - 3_600_000).toISOString() });
    const b = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's1', createdAt: new Date(NOW - 7_200_000).toISOString() });
    const rows = buildSigSearchResults([a, b], [sys], BASE, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].sig.sigId).toBe('AAA');
    expect(rows[1].sig.sigId).toBe('BBB');
  });

  it('filters by name — case-insensitive partial match', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const a = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW).toISOString(), name: 'Eagle Nebula' });
    const b = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's1', createdAt: new Date(NOW).toISOString(), name: 'Combat Site' });
    const rows = buildSigSearchResults([a, b], [sys], { ...BASE, name: 'nebula' }, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].sig.sigId).toBe('AAA');
  });

  it('name filter does not match sigs with null name', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const a = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW).toISOString(), name: null });
    const rows = buildSigSearchResults([a], [sys], { ...BASE, name: 'gas' }, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(0);
  });

  it('filters by groupKey', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const gas = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW).toISOString(), groupKey: 'gas' });
    const wh = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's1', createdAt: new Date(NOW).toISOString(), groupKey: 'wormhole' });
    const rows = buildSigSearchResults([gas, wh], [sys], { ...BASE, groupKey: 'gas' }, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].sig.sigId).toBe('AAA');
  });

  it('filters by maxAgeHours', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const fresh = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW - 1_800_000).toISOString() }); // 30 min
    const stale = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's1', createdAt: new Date(NOW - 7_200_000).toISOString() }); // 2 h
    const rows = buildSigSearchResults([fresh, stale], [sys], { ...BASE, maxAgeHours: 1 }, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].sig.sigId).toBe('AAA');
  });

  it('filters by securityClasses', () => {
    const whSys = makeSystem({ id: 's1', name: 'J123456', security: 'C3' });
    const hsSys = makeSystem({ id: 's2', name: 'Jita', security: 'H' });
    const whSig = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW).toISOString() });
    const hsSig = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's2', createdAt: new Date(NOW).toISOString() });
    const rows = buildSigSearchResults([whSig, hsSig], [whSys, hsSys], { ...BASE, securityClasses: ['C3'] }, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].sig.sigId).toBe('AAA');
  });

  it('drops sigs whose system is not in the systems list', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const orphan = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 'unknown', createdAt: new Date(NOW).toISOString() });
    const rows = buildSigSearchResults([orphan], [sys], BASE, 'sigId', 'asc', NOW);
    expect(rows).toHaveLength(0);
  });

  it('sorts by age descending — oldest first', () => {
    const sys = makeSystem({ id: 's1', name: 'J123456' });
    const newer = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW - 3_600_000).toISOString() });
    const older = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's1', createdAt: new Date(NOW - 7_200_000).toISOString() });
    const rows = buildSigSearchResults([newer, older], [sys], BASE, 'age', 'desc', NOW);
    expect(rows[0].sig.sigId).toBe('BBB');
    expect(rows[1].sig.sigId).toBe('AAA');
  });

  it('sorts by systemName ascending using alias when set', () => {
    const sysA = makeSystem({ id: 's1', name: 'J111111', alias: 'Bravo' });
    const sysB = makeSystem({ id: 's2', name: 'J222222', alias: 'Alpha' });
    const sigA = makeSig({ id: '1', sigId: 'AAA', mapSystemId: 's1', createdAt: new Date(NOW).toISOString() });
    const sigB = makeSig({ id: '2', sigId: 'BBB', mapSystemId: 's2', createdAt: new Date(NOW).toISOString() });
    const rows = buildSigSearchResults([sigA, sigB], [sysA, sysB], BASE, 'systemName', 'asc', NOW);
    expect(rows[0].system.alias).toBe('Alpha');
    expect(rows[1].system.alias).toBe('Bravo');
  });
});
```

- [ ] **Step 5: Run tests — expect FAIL (module not yet created)**

```bash
pnpm test tests/sigSearch.test.ts
```

Expected: `Cannot find module '@/lib/map/sigSearch'` or similar.

- [ ] **Step 6: Run tests again — expect PASS**

```bash
pnpm test tests/sigSearch.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/map/sigSearch.ts src/lib/map/sigSearch.md tests/sigSearch.test.ts
git commit -m "feat: add SigSearchFilters type and buildSigSearchResults utility"
```

---

## Task 2: Flash CSS + `SignatureModule` / `SignatureModuleHeaderActions` props

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/sidebar/SignatureModule.tsx`
- Modify: `src/components/sidebar/SignatureModule.md`

- [ ] **Step 1: Add flash keyframe to `src/app/globals.css`**

Append at the end of the file:

```css
@keyframes ap-sig-flash {
  0%   { background-color: transparent; }
  20%  { background-color: rgb(234 179 8 / 0.25); }
  80%  { background-color: rgb(234 179 8 / 0.25); }
  100% { background-color: transparent; }
}

.ap-sig-flash {
  animation: ap-sig-flash 3s ease-in-out forwards;
}
```

The color (`yellow-500/25`) is a placeholder — update later when the final color is decided.

- [ ] **Step 2: Add `flashSigId` to `SignatureModule` and thread it to `SignaturePanelBody`**

In `src/components/sidebar/SignatureModule.tsx`, make the following changes:

**2a.** Add `flashSigId` to the `SignatureModule` exported function's props destructuring and type block:

```ts
// Before:
export function SignatureModule({
  mapId,
  system,
  signatures,
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onConnectionPatch,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
})

// After:
export function SignatureModule({
  mapId,
  system,
  signatures,
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onConnectionPatch,
  flashSigId = null,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
  flashSigId?: string | null;
})
```

**2b.** Pass `flashSigId` into `<SignaturePanelBody>` (the `key={system.id}` call inside the `system ?` branch):

```tsx
// Before:
<SignaturePanelBody
  key={system.id}
  mapId={mapId}
  system={system}
  signatures={signatures}
  connections={connections}
  systems={systems}
  onCreate={onCreate}
  onPatch={onPatch}
  onDelete={onDelete}
  onConnectionPatch={onConnectionPatch}
/>

// After:
<SignaturePanelBody
  key={system.id}
  mapId={mapId}
  system={system}
  signatures={signatures}
  connections={connections}
  systems={systems}
  onCreate={onCreate}
  onPatch={onPatch}
  onDelete={onDelete}
  onConnectionPatch={onConnectionPatch}
  flashSigId={flashSigId}
/>
```

**2c.** Add `flashSigId` to `SignaturePanelBody`'s props type and destructuring:

```ts
// Add to the props type block of SignaturePanelBody:
  flashSigId?: string | null;
```

And to the destructuring:

```ts
function SignaturePanelBody({
  mapId,
  system,
  signatures,
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onConnectionPatch,
  flashSigId = null,   // ← add
}: { ... flashSigId?: string | null; ... })
```

**2d.** Apply the flash class on the matching `<tr>` in the TanStack Table row loop. Find the row render loop (around line 627):

```tsx
// Before:
{table.getRowModel().rows.map((row) => (
  <tr key={row.id} className="border-t border-foreground/10 align-middle">

// After:
{table.getRowModel().rows.map((row) => (
  <tr
    key={row.id}
    className={cn(
      'border-t border-foreground/10 align-middle',
      row.original.id === flashSigId && 'ap-sig-flash',
    )}
  >
```

- [ ] **Step 3: Add `onOpenSearch` to `SignatureModuleHeaderActions`**

In `src/components/sidebar/SignatureModule.tsx`, update `SignatureModuleHeaderActions`:

```ts
// Before:
export function SignatureModuleHeaderActions({
  mapId,
  system,
  signatures,
  onBulkPaste,
  lazyDelete,
  onLazyDeleteChange,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  onBulkPaste: (payloads: MapEventPayload[]) => void;
  lazyDelete: boolean;
  onLazyDeleteChange: (next: boolean) => void;
}) {
  if (!system) return null;
  return (
    <>
      <LazyDeleteToggle armed={lazyDelete} onArmedChange={onLazyDeleteChange} />
      <SignaturePasteButton
        mapId={mapId}
        system={system}
        signatures={signatures}
        onBulkPaste={onBulkPaste}
      />
    </>
  );
}

// After:
export function SignatureModuleHeaderActions({
  mapId,
  system,
  signatures,
  onBulkPaste,
  lazyDelete,
  onLazyDeleteChange,
  onOpenSearch,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  onBulkPaste: (payloads: MapEventPayload[]) => void;
  lazyDelete: boolean;
  onLazyDeleteChange: (next: boolean) => void;
  onOpenSearch: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onOpenSearch}>
        <Search className="size-3.5" />
        Search
      </Button>
      {system && (
        <>
          <LazyDeleteToggle armed={lazyDelete} onArmedChange={onLazyDeleteChange} />
          <SignaturePasteButton
            mapId={mapId}
            system={system}
            signatures={signatures}
            onBulkPaste={onBulkPaste}
          />
        </>
      )}
    </>
  );
}
```

Note: The search button is always shown (it searches across all systems, not just the selected one). The lazy-delete and paste buttons remain conditional on `system`.

You also need to add `Search` to the lucide import at the top of the file. Find the existing lucide import line and add `Search` to it.

- [ ] **Step 4: Update `src/components/sidebar/SignatureModule.md`**

Add `flashSigId` to the Props table of `SignatureModule`:

```markdown
| flashSigId | string \| null | no | When set, the matching signature row flashes with `ap-sig-flash` for 3 s. Cleared by MapCanvas after the timeout. |
```

Add `onOpenSearch` to the Props table of `SignatureModuleHeaderActions`:

```markdown
| onOpenSearch | () => void | yes | Opens the `SignatureSearchDialog`. Wired to `setSigSearchOpen(true)` in `MapCanvas`. The search button is always rendered (searches across all systems); lazy-delete and paste remain gated on a selected system. |
```

- [ ] **Step 5: Run the TypeScript compiler to verify no type errors**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/sidebar/SignatureModule.tsx src/components/sidebar/SignatureModule.md
git commit -m "feat: add flash row highlight and search button to SignatureModule"
```

---

## Task 3: Build `SignatureSearchDialog`

**Files:**
- Create: `src/components/dialogs/SignatureSearchDialog.tsx`
- Modify: `src/components/dialogs/SignatureSearchDialog.md` (already exists from brainstorming)

- [ ] **Step 1: Create `src/components/dialogs/SignatureSearchDialog.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { buildSigSearchResults, type SigSortField, type SigSortDir } from '@/lib/map/sigSearch';
import { SIGNATURE_GROUP_CATALOG, labelForSignatureGroupKey } from '@/lib/map/signatureGroups';
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import type { MapSignature, MapSystemNode, SigSearchFilters, SignatureGroupKey } from '@/types';

const SECURITY_CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: 'H',   label: 'HS' },
  { value: 'L',   label: 'LS' },
  { value: '0.0', label: 'NS' },
  { value: 'P',   label: 'Poch' },
  { value: 'C1',  label: 'C1' },
  { value: 'C2',  label: 'C2' },
  { value: 'C3',  label: 'C3' },
  { value: 'C4',  label: 'C4' },
  { value: 'C5',  label: 'C5' },
  { value: 'C6',  label: 'C6' },
  { value: 'A',   label: 'Thera' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatures: MapSignature[];
  systems: MapSystemNode[];
  filters: SigSearchFilters;
  onFiltersChange: (f: SigSearchFilters) => void;
  onNavigate: (systemId: string, sigId: string) => void;
}

export function SignatureSearchDialog({
  open,
  onOpenChange,
  signatures,
  systems,
  filters,
  onFiltersChange,
  onNavigate,
}: Props) {
  const [sortField, setSortField] = useState<SigSortField>('sigId');
  const [sortDir, setSortDir] = useState<SigSortDir>('asc');

  const rows = buildSigSearchResults(
    signatures,
    systems,
    filters,
    sortField,
    sortDir,
    Date.now(),
  );

  function handleSortHeader(field: SigSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleSecClass(value: string) {
    const current = filters.securityClasses;
    onFiltersChange({
      ...filters,
      securityClasses: current.includes(value)
        ? current.filter((c) => c !== value)
        : [...current, value],
    });
  }

  function sortIndicator(field: SigSortField) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Signature Search
          </DialogTitle>
        </DialogHeader>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Name…"
            value={filters.name}
            onChange={(e) => onFiltersChange({ ...filters, name: e.target.value })}
            className="h-8 w-40"
          />

          <Select
            value={filters.groupKey ?? '_all'}
            onValueChange={(v) =>
              onFiltersChange({
                ...filters,
                groupKey: v === '_all' ? null : (v as SignatureGroupKey),
              })
            }
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Any group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Any group</SelectItem>
              {SIGNATURE_GROUP_CATALOG.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min={0}
            placeholder="Max age (h)"
            value={filters.maxAgeHours ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                maxAgeHours: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="h-8 w-32"
          />

          <div className="flex flex-wrap gap-1">
            {SECURITY_CLASS_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={filters.securityClasses.includes(opt.value) ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => toggleSecClass(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Results table */}
        <div className="max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5 font-medium w-20">Group</th>
                <th
                  className="px-2 py-1.5 font-medium w-16 cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSortHeader('sigId')}
                >
                  Sig{sortIndicator('sigId')}
                </th>
                <th
                  className="px-2 py-1.5 font-medium cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSortHeader('systemName')}
                >
                  System{sortIndicator('systemName')}
                </th>
                <th className="px-2 py-1.5 font-medium w-16">Sec</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th
                  className="px-2 py-1.5 font-medium w-24 cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSortHeader('age')}
                >
                  Age{sortIndicator('age')}
                </th>
                <th className="px-2 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-6 text-center text-xs text-muted-foreground"
                  >
                    No signatures match your filters.
                  </td>
                </tr>
              )}
              {rows.map(({ sig, system, ageMs }) => (
                <tr
                  key={sig.id}
                  className="border-b border-border/50 hover:bg-muted/30"
                >
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {labelForSignatureGroupKey(sig.groupKey) ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{sig.sigId}</td>
                  <td className="px-2 py-1.5 text-xs">{system.alias ?? system.name}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {system.security ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {sig.name ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {formatAgoFromMs(ageMs)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onNavigate(system.id, sig.id)}
                      title={`Go to ${system.alias ?? system.name}`}
                    >
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          {rows.length} result{rows.length !== 1 ? 's' : ''}
        </p>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run the TypeScript compiler**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Update `src/components/dialogs/SignatureSearchDialog.md`**

The file already exists from brainstorming. Replace its content with the final companion doc:

```markdown
## SignatureSearchDialog

**Purpose:** Modal dialog for searching and filtering signatures across all systems on the currently-open map.
**File:** `src/components/dialogs/SignatureSearchDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |
| signatures | MapSignature[] | yes | All map signatures from `viewData` |
| systems | MapSystemNode[] | yes | All map systems from `viewData` |
| filters | SigSearchFilters | yes | Filter state owned by `MapCanvas` (persists between opens) |
| onFiltersChange | (f: SigSearchFilters) => void | yes | Updates filter state in `MapCanvas` |
| onNavigate | (systemId: string, sigId: string) => void | yes | Closes dialog, centers canvas, selects system, starts row flash |

### Renders
A `max-w-3xl` dialog with a filter bar (name text input, group select, max-age hours input, security-class toggle buttons) and a scrollable results table. Columns: Group, Sig ID, System (alias ?? name), Security, Name, Age (from `createdAt`), action button. Column headers for Sig, System, and Age are sortable (click to toggle asc/desc). A result count is shown below the table.

### Behaviour & Interactions
- All filtering and sorting is done synchronously in the render path via `buildSigSearchResults` from `@/lib/map/sigSearch`. No server fetch — data is always live from `viewData`.
- Filter state is owned by `MapCanvas` so the filters persist when the dialog is closed and reopened.
- Age is computed from `sig.createdAt` (not `updatedAt`).
- Clicking the → button on a result row calls `onNavigate(system.id, sig.id)`, which closes the dialog, selects the system, centers the canvas, and starts a 3-second row flash in `SignatureModule`.
- Security class filter buttons are multi-select toggles (empty = all classes).
- The `_all` sentinel is used for the group `<Select>` "Any group" option, mapping to `groupKey: null` in `SigSearchFilters`.

### Depends On
- `buildSigSearchResults`, `SigSortField`, `SigSortDir` from `@/lib/map/sigSearch`
- `SIGNATURE_GROUP_CATALOG`, `labelForSignatureGroupKey` from `@/lib/map/signatureGroups`
- `formatAgoFromMs` from `@/lib/map/relativeTime`
- `Dialog`, `Input`, `Button`, `Select` from `@/components/ui/*`
- `cn` from `@/lib/utils`
- Types: `MapSignature`, `MapSystemNode`, `SigSearchFilters`, `SignatureGroupKey` from `@/types`
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dialogs/SignatureSearchDialog.tsx src/components/dialogs/SignatureSearchDialog.md
git commit -m "feat: build SignatureSearchDialog component"
```

---

## Task 4: Wire into `MapCanvas`

**Files:**
- Modify: `src/components/map/MapCanvas.tsx`

- [ ] **Step 1: Add imports to `MapCanvas.tsx`**

Find the existing lucide import line (e.g. `import { Info, Plus, Settings, … } from 'lucide-react'`) and add `Search` to it.

Find the existing dialog imports block and add:

```ts
import { SignatureSearchDialog } from '@/components/dialogs/SignatureSearchDialog';
```

Find the existing type imports and add:

```ts
import type { SigSearchFilters } from '@/types';
```

- [ ] **Step 2: Add state near the existing dialog state (around line 284)**

Find:
```ts
const [mapInfoOpen, setMapInfoOpen] = useState(false);
const [settingsOpen, setSettingsOpen] = useState(false);
```

Add after:
```ts
const [sigSearchOpen, setSigSearchOpen] = useState(false);
const [sigSearchFilters, setSigSearchFilters] = useState<SigSearchFilters>({
  name: '',
  groupKey: null,
  maxAgeHours: null,
  securityClasses: [],
});
const [flashSigId, setFlashSigId] = useState<string | null>(null);
```

- [ ] **Step 3: Define the `onNavigate` callback**

Add this function in the component body, after the state declarations:

```ts
function handleNavigateToSig(systemId: string, sigId: string) {
  setSigSearchOpen(false);
  setSelected({ kind: 'system', id: systemId });
  setSelectedSystemIds(new Set([systemId]));
  flowInstance.current?.fitView({ nodes: [{ id: systemId }], padding: 0.5, duration: 400 });
  setFlashSigId(sigId);
  setTimeout(() => setFlashSigId(null), 3000);
}
```

`setSelected` and `setSelectedSystemIds` are the existing selection state setters already present in `MapCanvas`.

- [ ] **Step 4: Add the Search toolbar button**

Find the toolbar button cluster (around line 1415) where "Map info" and "Settings" buttons live:

```tsx
// Before:
<Button variant="ghost" size="sm" onClick={() => setMapInfoOpen(true)}>
  <Info />
  Map info
</Button>

// After:
<Button variant="ghost" size="sm" onClick={() => setSigSearchOpen(true)}>
  <Search />
  Search
</Button>
<Button variant="ghost" size="sm" onClick={() => setMapInfoOpen(true)}>
  <Info />
  Map info
</Button>
```

- [ ] **Step 5: Add `onOpenSearch` to the `SignatureModuleHeaderActions` call**

Find the `<SignatureModuleHeaderActions` JSX (inside `panelHeaderRight`):

```tsx
// Before:
<SignatureModuleHeaderActions
  mapId={mapId}
  system={selectedSystem}
  signatures={viewData.signatures}
  onBulkPaste={onBulkPaste}
  lazyDelete={lazyDeleteSigs}
  onLazyDeleteChange={setLazyDeleteSigs}
/>

// After:
<SignatureModuleHeaderActions
  mapId={mapId}
  system={selectedSystem}
  signatures={viewData.signatures}
  onBulkPaste={onBulkPaste}
  lazyDelete={lazyDeleteSigs}
  onLazyDeleteChange={setLazyDeleteSigs}
  onOpenSearch={() => setSigSearchOpen(true)}
/>
```

- [ ] **Step 6: Pass `flashSigId` to `SignatureModule`**

Find the `<SignatureModule` JSX (in `panelContent('signatures')`):

```tsx
// Before:
<SignatureModule
  mapId={mapId}
  system={selectedSystem}
  signatures={viewData.signatures}
  connections={viewData.connections}
  systems={viewData.systems}
  onCreate={onSignatureCreate}
  onPatch={onSignaturePatch}
  onDelete={onSignatureDelete}
  onConnectionPatch={onConnectionPatch}
/>

// After:
<SignatureModule
  mapId={mapId}
  system={selectedSystem}
  signatures={viewData.signatures}
  connections={viewData.connections}
  systems={viewData.systems}
  onCreate={onSignatureCreate}
  onPatch={onSignaturePatch}
  onDelete={onSignatureDelete}
  onConnectionPatch={onConnectionPatch}
  flashSigId={flashSigId}
/>
```

- [ ] **Step 7: Mount `<SignatureSearchDialog>`**

Find the dialog mount block (after `<AddSystemDialog … />`):

```tsx
// Add after AddSystemDialog:
<SignatureSearchDialog
  open={sigSearchOpen}
  onOpenChange={setSigSearchOpen}
  signatures={viewData.signatures}
  systems={viewData.systems}
  filters={sigSearchFilters}
  onFiltersChange={setSigSearchFilters}
  onNavigate={handleNavigateToSig}
/>
```

- [ ] **Step 8: Run the TypeScript compiler**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/map/MapCanvas.tsx
git commit -m "feat: wire SignatureSearchDialog into MapCanvas"
```
