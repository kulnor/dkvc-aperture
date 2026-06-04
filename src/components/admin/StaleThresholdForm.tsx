'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminSetStaleSignatureThreshold } from '@/app/(admin)/actions/settings';

/**
 * Global-admin editor for the instance-wide default stale-signature threshold
 * (`/admin/settings`). Edited in hours; persisted in minutes. Per-account
 * overrides (capped at this value) live in Account settings.
 */
export function StaleThresholdForm({ initialMinutes }: { initialMinutes: number }) {
  const [hours, setHours] = useState(String(Number((initialMinutes / 60).toFixed(2))));
  const [pending, startTransition] = useTransition();

  function onSave() {
    const value = Number(hours.trim());
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a positive number of hours.');
      return;
    }
    const minutes = Math.round(value * 60);
    startTransition(async () => {
      const result = await adminSetStaleSignatureThreshold({ minutes });
      if (result.ok) {
        setHours(String(Number((minutes / 60).toFixed(2))));
        toast.success('Default threshold saved.');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex max-w-sm items-end gap-2">
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Stale-signature threshold (hours)</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={hours}
          disabled={pending}
          onChange={(e) => setHours(e.target.value)}
          aria-label="Stale-signature threshold (hours)"
        />
      </label>
      <Button type="button" onClick={onSave} disabled={pending}>
        Save
      </Button>
    </div>
  );
}
