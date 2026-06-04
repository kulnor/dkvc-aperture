'use client';

import { Scissors, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Non-blocking "delete the subchain?" overlay. Mirrors the dismissible `Card`
 * pattern of `TransitSignaturePrompt` — the standard for map-related dialogs,
 * so the rest of the UI stays interactive. Used for the sig-delete offer
 * ("Also delete the subchain beyond …?"), the context-menu subchain confirm
 * ("Delete subchain beyond …?", via the `lead` override), and the
 * delete-disconnected confirm (`lead` only, no `headName`). Visibility is
 * controlled by the parent (rendered only when a prompt is pending). Pinned
 * bottom-left to clear the transit prompt (top-left) and the "Remove N" button
 * (top-right).
 */
export function SubchainDeletePrompt({
  headName,
  count,
  onConfirm,
  onDismiss,
  lead = 'Also delete the subchain beyond',
}: {
  /** Display name of the head system; omit for a name-less question (e.g. delete-disconnected). */
  headName?: string;
  /** Number of systems that will be removed (includes the head). */
  count: number;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Leading question text before the head name. Defaults to the sig-delete offer. */
  lead?: string;
}) {
  return (
    <Card className="nodrag nopan absolute bottom-2 left-2 z-10 max-w-xs gap-2 p-3 text-sm shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">
          {lead}
          {headName ? <span className="text-foreground"> {headName}</span> : null}?
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-6 shrink-0"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      <Button type="button" variant="destructive" size="sm" className="gap-2" onClick={onConfirm}>
        <Scissors className="size-3.5" />
        Delete {count} {count === 1 ? 'system' : 'systems'}
      </Button>
    </Card>
  );
}
