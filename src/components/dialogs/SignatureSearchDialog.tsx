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
import { buildSigSearchResults, type SigSortField, type SigSortDir } from '@/lib/map/sigSearch';
import { SIGNATURE_GROUP_CATALOG, labelForSignatureGroupKey } from '@/lib/map/signatureGroups';
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import { systemClassColor } from '@/components/map/styling';
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
              <SelectItem value="_all">All Types</SelectItem>
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
            {SECURITY_CLASS_OPTIONS.map((opt) => {
              const active = filters.securityClasses.includes(opt.value);
              const color = systemClassColor(opt.value);
              return (
                <Button
                  key={opt.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  style={active ? { color, borderColor: color } : { color }}
                  onClick={() => toggleSecClass(opt.value)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Results table */}
        <div className="min-h-48 max-h-96 overflow-y-auto rounded border border-border">
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
