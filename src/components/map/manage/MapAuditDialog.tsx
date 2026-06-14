'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapAuditBrowser } from './MapAuditBrowser';

/**
 * Wider dialog hosting the in-map audit console. Launched from the `MapCanvas`
 * toolbar "Audit log" button (rendered only for `canManageMap` holders). The
 * feed itself is gated server-side by `GET /api/map/[mapId]/audit`.
 */
export function MapAuditDialog({
  open,
  onOpenChange,
  mapId,
  mapName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapId: string;
  mapName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
          <DialogDescription>{mapName}</DialogDescription>
        </DialogHeader>
        {/* Mount the feed only while open so it doesn't poll in the background. */}
        {open && <MapAuditBrowser mapId={mapId} />}
      </DialogContent>
    </Dialog>
  );
}
