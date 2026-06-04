'use client';

import { Scissors, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Non-blocking "also delete the subchain?" overlay, offered after a wormhole
 * signature with a populated "Leads to" is deleted. Mirrors the dismissible
 * `Card` pattern of `TransitSignaturePrompt` rather than the blocking
 * `SubchainDeleteDialog` the context menu uses. Visibility is controlled by the
 * parent (rendered only when a prompt is pending). Pinned bottom-left to clear
 * the transit prompt (top-left) and the "Remove N" button (top-right).
 */
export function SubchainDeletePrompt({
  headName,
  count,
  onConfirm,
  onDismiss,
}: {
  /** Display name of the head system (the far end of the deleted sig's hole). */
  headName: string;
  /** Number of systems that will be removed (includes the head). */
  count: number;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="nodrag nopan absolute bottom-2 left-2 z-10 max-w-xs gap-2 p-3 text-sm shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">
          Also delete the subchain beyond{' '}
          <span className="text-foreground">{headName}</span>?
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
