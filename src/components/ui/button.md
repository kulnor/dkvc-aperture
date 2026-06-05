## Button

**Purpose:** shadcn primitive button. Default install — `import { Button } from '@/components/ui/button'`.
**File:** `src/components/ui/button.tsx`

### Props
Inherits `ButtonPrimitive.Props` from `@base-ui/react/button` plus the `VariantProps` of `buttonVariants`:

| Prop | Type | Description |
|---|---|---|
| variant | `'default' \| 'outline' \| 'secondary' \| 'ghost' \| 'destructive' \| 'link'` | Visual style. Defaults to `'default'`. |
| size | `'default' \| 'xs' \| 'sm' \| 'lg' \| 'icon' \| 'icon-xs' \| 'icon-sm' \| 'icon-lg'` | Sizing token. Defaults to `'default'`. |
| className | string | Extra classes; merged with `cn()`. |

### Exports
- `Button` — the component.
- `buttonVariants` — the `cva` helper, exported so other components can reuse the styling tokens.

### Depends on
- `@base-ui/react/button` — accessibility-checked primitive.
- `class-variance-authority` — variant resolution.
- `@/lib/utils` — `cn` helper.
