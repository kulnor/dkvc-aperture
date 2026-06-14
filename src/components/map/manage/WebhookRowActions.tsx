'use client';

import { useState, useTransition } from 'react';
import { Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  deleteWebhook,
  resetWebhookFailures,
  testWebhook,
} from '@/app/(app)/actions/webhooks';
import { WebhookForm } from './WebhookForm';

type WebhookChannel = 'discord';
type WebhookEvent = 'history' | 'rally';

export type WebhookRowActionsProps = {
  webhook: {
    id: string;
    channel: WebhookChannel;
    event: WebhookEvent;
    url: string;
    username: string | null;
    consecutiveFailures: number;
  };
  /** Refresh the list after a mutation (test/reset/edit/delete). */
  onChanged?: () => void;
};

/**
 * Per-row action cluster for the webhook list: test-fire, reset
 * failure counter (only when failing), edit (dialog wrapping `WebhookForm`),
 * and delete (confirm dialog). Each successful mutation calls `onChanged` so
 * the panel refetches.
 */
export function WebhookRowActions({ webhook, onChanged }: WebhookRowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <TestButton webhook={webhook} onChanged={onChanged} />
      {webhook.consecutiveFailures > 0 && <ResetButton webhook={webhook} onChanged={onChanged} />}
      <EditButton webhook={webhook} onChanged={onChanged} />
      <DeleteButton webhook={webhook} onChanged={onChanged} />
    </div>
  );
}

function TestButton({
  webhook,
  onChanged,
}: {
  webhook: WebhookRowActionsProps['webhook'];
  onChanged?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const result = await testWebhook(webhook.id);
      if (result.ok) {
        toast.success('Test fired — the status updates in a moment.');
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Test fire"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      <Send />
    </Button>
  );
}

function ResetButton({
  webhook,
  onChanged,
}: {
  webhook: WebhookRowActionsProps['webhook'];
  onChanged?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const result = await resetWebhookFailures(webhook.id);
      if (result.ok) {
        toast.success('Failure counter cleared.');
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Reset failure counter"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      <RotateCcw />
    </Button>
  );
}

function EditButton({
  webhook,
  onChanged,
}: {
  webhook: WebhookRowActionsProps['webhook'];
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit webhook"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit webhook</DialogTitle>
          <DialogDescription>
            Channel and event class are immutable. Delete and re-add to change them.
          </DialogDescription>
        </DialogHeader>
        <WebhookForm
          mode="edit"
          webhook={webhook}
          onDone={() => {
            setOpen(false);
            onChanged?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({
  webhook,
  onChanged,
}: {
  webhook: WebhookRowActionsProps['webhook'];
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteWebhook(webhook.id);
      if (result.ok) {
        toast.success('Webhook removed.');
        setOpen(false);
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete webhook"
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove webhook?</DialogTitle>
          <DialogDescription>
            This webhook will stop receiving map events immediately. The Discord channel
            itself is not touched — re-adding the URL restores the subscription.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="ghost" disabled={pending} />}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
