'use client';

import { Scissors } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Confirmation for the delete-subchain action. The systems it lists are also
 * highlighted on the canvas (the caller selects them before opening this), so
 * this is the second half of the "visual indication + confirm" flow.
 */
export function SubchainDeleteDialog({
  open,
  headName,
  systemNames,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** Display name of the head system the user acted on. */
  headName: string;
  /** Display names of every system that will be removed (includes the head). */
  systemNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const count = systemNames.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-4 text-destructive" />
            Delete subchain
          </DialogTitle>
          <DialogDescription>
            Remove <span className="font-medium text-foreground">{headName}</span> and{' '}
            {count === 1 ? 'no other systems' : `everything beyond it (${count} systems total)`}.
            Their connections are deleted too. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        {count > 1 && (
          <ul className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            {systemNames.map((name, i) => (
              <li key={`${name}-${i}`} className="px-1 py-0.5">
                {name}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete {count} {count === 1 ? 'system' : 'systems'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
