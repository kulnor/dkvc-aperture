import { z } from 'zod';
import type { MapLayoutConfig, PanelId } from '@/types';
import { PANELS } from './panels';

// System boundary: the layout config is user-supplied JSON (posted by the grid's
// debounced save) before it lands in `ap_user.map_layout`. Validate the whole
// shape with bounded numeric ranges; unknown item keys (RGL's `static`, `moved`,
// `maxW`, …) are stripped — only the minimal geometry is persisted.

const panelId = z.enum(PANELS.map((p) => p.id) as [PanelId, ...PanelId[]]);

const COORD = z.number().int().min(0).max(1000);
const SPAN = z.number().int().min(1).max(1000);

const layoutItem = z.object({
  i: panelId,
  x: COORD,
  y: COORD,
  w: SPAN,
  h: SPAN,
  minW: COORD.optional(),
  minH: COORD.optional(),
});

const breakpointLayout = z.array(layoutItem).max(50);

export const mapLayoutConfigSchema = z.object({
  version: z.number().int().min(0).max(1_000_000),
  layouts: z.object({
    lg: breakpointLayout,
    md: breakpointLayout,
    sm: breakpointLayout,
  }),
  hidden: z.array(panelId).max(50),
});

// Compile-time guarantee the parser's output is a valid `MapLayoutConfig`.
export type ParsedMapLayout = z.infer<typeof mapLayoutConfigSchema>;
type _AssignableToConfig = ParsedMapLayout extends MapLayoutConfig ? true : never;
const _check: _AssignableToConfig = true;
void _check;
