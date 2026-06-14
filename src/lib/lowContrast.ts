'use client';

/**
 * Low-contrast display preference. Client-only, persisted to localStorage and
 * applied as a `low-contrast` class on the document root, which the dark-theme
 * overrides in globals.css key off. Defaults to off. `LowContrastController`
 * applies it on initial load; `writeLowContrast` is the live toggle path.
 */

export const LOW_CONTRAST_KEY = 'aperture:low-contrast';

/** Whether low-contrast mode is currently enabled in localStorage (off by default). */
export function readLowContrast(): boolean {
  try {
    return localStorage.getItem(LOW_CONTRAST_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the preference and toggle the `low-contrast` class on `<html>` live. */
export function writeLowContrast(enabled: boolean): void {
  try {
    localStorage.setItem(LOW_CONTRAST_KEY, enabled ? '1' : '0');
  } catch {}
  document.documentElement.classList.toggle('low-contrast', enabled);
}
