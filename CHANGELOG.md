# Changelog

## v1.0.0-rc.4

This release adds map ping and rally tooling, refines the wormhole type selector and signature search, and corrects several wormhole static-data issues.

### New features

- **Map ping and rally** — new overlay buttons to ping the map and rally tracked pilots to a chosen map node, with a hidden rallypoint easter egg. Ping notifications now stay up longer. *(Ionis en Gravonere)*

### Improvements

- **Signature search system tag** — search results now carry a system tag. *(Ionis en Gravonere)*
- **Discoverable signature search** — the search Go button is more discoverable. *(MonoliYoda)*
- **Wormhole type selector** — K162 now sorts after statics with a separator. *(Ionis en Gravonere)*
- **Connection mass log ordering** — jumps are returned newest-first so the latest activity is shown at the top. *(Ionis en Gravonere)*
- **Copyable system name** — the inspector system name can now be selected for copy. *(MonoliYoda)*
- **Re-home an alt** — an alt can be moved onto the linking account, with audit re-attribution. *(MonoliYoda)*

### Fixes

- Homefront combat site signatures now paste correctly despite being in the database. *(Ionis en Gravonere)*
- C13 small shattered Wolf-Rayet systems are now labeled A, B, C, etc. *(Ionis en Gravonere)*
- Added missing Pochven wormholes to the wormhole-classes seed data. *(Ionis en Gravonere)*
- Renamed Thera to C12 in the wormhole-classes data to match Aperture conventions. *(Ionis en Gravonere)*

### Misc

- Replaced CCP with Fenris Creations in trademark notices. *(Ionis en Gravonere)*

### Contributors

- **Ionis en Gravonere** — ping/rally tooling, wormhole selector and signature search refinements, static-data fixes
- **MonoliYoda** — alt re-homing, inspector copy polish

## v1.0.0-rc.3

This release hardens character access and tracking around corp/alliance membership changes, so leavers lose access promptly and joiners are picked up quickly.

### Access control

- **Faster, more accurate affiliation resolution** — corp/alliance is now resolved from the ~1h-cached ESI affiliation endpoint instead of the ~24h-cached public character profile, so new members gate in within the hour rather than the next day.
- **Revocation on corp departure** — character cleanup gains an affiliation sweep that detects corp/alliance changes and revokes access: it re-syncs authz, prunes map tracking the pilot can no longer view, and broadcasts a logout. A pilot who leaves the owning corp/alliance of a restricted deployment is now signed out.

### Tracking

- **Auto-track on regained access** — a re-joining or newly-added character is now automatically tracked on already-opened maps, mirroring the existing prune-on-departure behaviour. Wired into both re-login (add-alt) and corp re-join without a fresh login.

### Fixes

- Removed redundant padding from indented alts in the pilot view. *(Ionis en Gravonere)*

### Contributors

- **Ionis en Gravonere** — pilot view polish

## v1.0.0-rc.2

### Fixes

- Let every map viewer edit map content (systems, signatures, connections); content editing is view-gated rather than restricted to managers.

## v1.0.0-rc.1

First release candidate for 1.0.0. This is a large release headlined by a rework of the permissions model, plus new map tooling (audit log, signature search) and a migration to CCP's 2026 ESI.

### Breaking — Permissions & multitenancy rework

Admin authority is now **derived from EVE roles and instance ownership** rather than hand-managed tiers:

- Any EVE Corp **Director** resolves to admin authority over their own corp's maps; global `admin` comes only from an explicit grant or instance ownership.
- The old per-corp **manager** tier and the **corp-rights matrix** have been removed (`authz_level` is now `member` | `admin`).
- Moderation actions and the `/admin` console are now **admin-only**.

### New features

- **Map audit log viewer** — browse a map's change history with filtering and manual refresh.
- **Signature search** — new dialog to search signatures across systems, with wormhole/k-space security class grouping, type filters, and click-to-navigate row highlighting. *(Ionis en Gravonere)*
- **Set-destination submenu** — when multiple tracked characters are located, pick which one to route from the map context menu. *(Ionis en Gravonere)*
- **Faction Warfare and incursion system decorators** — systems now show FW and incursion status.
- **Low-contrast mode** — accessibility option for reduced-contrast theming.

### ESI 2026 migration

*Contributed by Ionis en Gravonere.*

- Replaced the deprecated ESI Swagger spec with the **OpenAPI spec**, with typed access via `openapi-types`.
- Now sends **`X-Compatibility-Date`**; sovereignty decoder migrated to the 2026 ESI shape, plus an alliance decoder.

### Fixes

- Fixed system stats failing to load on newly-added map systems.
- Tracked pilots no longer pollute maps with systems they merely transit while Aperture is closed.
- UI polish: audit log dialog sizing, scrollbar and select theming, map settings dialog width.

### Contributors

- **Ionis en Gravonere** — signature search, set-destination submenu, ESI 2026 migration
