'use client';

import { useEffect } from 'react';
import { readLowContrast } from '@/lib/lowContrast';

/**
 * Applies the persisted low-contrast display preference to the document root
 * after hydration. Renders nothing. Kept as an effect (rather than an inline
 * pre-paint script) so the server-rendered `<html>` className and the client's
 * agree — no hydration mismatch, no `suppressHydrationWarning`. The only cost is
 * a one-frame settle on reload for the minority who enable it. The live toggle
 * path is `writeLowContrast` in `@/lib/lowContrast`.
 */
export function LowContrastController() {
  useEffect(() => {
    document.documentElement.classList.toggle('low-contrast', readLowContrast());
  }, []);
  return null;
}
