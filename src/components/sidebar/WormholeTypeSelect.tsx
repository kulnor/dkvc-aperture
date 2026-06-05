'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchWormholeTypes } from '@/lib/map/client';
import { systemClassColor } from '@/components/map/styling';
import type { WormholeTypeOption } from '@/types';

const NONE_VALUE = '__none__';

/**
 * Class-filtered wormhole-type dropdown for the signature inspector.
 * Lazy-loads options from `/api/map/[mapId]/wormhole-types?systemId=`
 * when mounted, then keeps them in a per-(mapId, universeSystemId) cache so
 * swapping between systems doesn't re-fetch.
 */
export function WormholeTypeSelect({
  mapId,
  universeSystemId,
  value,
  onValueChange,
  disabled,
}: {
  mapId: string;
  universeSystemId: number;
  /** Selected `universe_wormhole.type_id`, or null when unset. */
  value: number | null;
  onValueChange: (next: number | null) => void;
  disabled?: boolean;
}) {
  // Combine `loading` and `options` in one state object so the effect body only
  // calls `setState` from the async resolver — never synchronously during the
  // effect run (which would trip the cascading-render lint rule).
  const [state, setState] = useState<{ loading: boolean; options: WormholeTypeOption[] }>({
    loading: true,
    options: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetchWormholeTypes({ mapId, universeSystemId }).then((result) => {
      if (cancelled) return;
      setState({ loading: false, options: result.ok ? result.data : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [mapId, universeSystemId]);

  const { loading, options } = state;

  const items = useMemo(() => {
    const labels: Record<string, string> = { [NONE_VALUE]: 'Select type…' };
    for (const opt of options) labels[String(opt.typeId)] = opt.name;
    return labels;
  }, [options]);

  // Pin the system's statics to the top so they're the first thing the user
  // sees; the rest keep the server's alphabetical order.
  const { statics, others } = useMemo(() => {
    const statics: WormholeTypeOption[] = [];
    const others: WormholeTypeOption[] = [];
    for (const opt of options) (opt.isStatic ? statics : others).push(opt);
    return { statics, others };
  }, [options]);

  const stringValue = value == null ? NONE_VALUE : String(value);

  // Color-code the destination class with the same palette the map uses for
  // system-node statics, so a hole's target reads consistently in both places.
  const renderOption = (opt: WormholeTypeOption) => (
    <SelectItem className="py-1" key={opt.typeId} value={String(opt.typeId)}>
      <span className="flex w-full justify-between gap-4">
        <span>{opt.name}</span>
        {opt.targetClass && (
          <span
            className="shrink-0 font-bold"
            style={{ color: systemClassColor(opt.targetClass) }}
          >
            {opt.targetClass}
          </span>
        )}
      </span>
    </SelectItem>
  );

  return (
    <Select<string>
      value={stringValue}
      onValueChange={(next) => {
        if (!next || next === NONE_VALUE) onValueChange(null);
        else onValueChange(Number(next));
      }}
      items={items}
      disabled={disabled || loading}
    >
      <SelectTrigger>
        <SelectValue className="min-w-0 flex-1">
          {(val: string) => {
            const opt = val === NONE_VALUE ? undefined : options.find((o) => String(o.typeId) === val);
            if (!opt) return loading ? 'Loading…' : 'Select type…';
            return (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <span className="truncate">{opt.name}</span>
                {opt.targetClass && (
                  <span
                    className="shrink-0 font-bold"
                    style={{ color: systemClassColor(opt.targetClass) }}
                  >
                    {opt.targetClass}
                  </span>
                )}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="p-0.5">
        <SelectItem className="py-1" value={NONE_VALUE}>
          {loading ? 'Loading…' : 'Select type…'}
        </SelectItem>
        {statics.length > 0 && (
          <>
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-medium uppercase text-muted-foreground">
              Statics
            </div>
            {statics.map(renderOption)}
            {others.length > 0 && <div className="my-0.5 h-px bg-border" />}
          </>
        )}
        {others.map(renderOption)}
      </SelectContent>
    </Select>
  );
}
