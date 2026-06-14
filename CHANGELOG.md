# Changelog

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
