## abc.ts

**Purpose:** Scheme A "ABC" — per-WH-class sequential-letter tagging (Stage 17.10). Pure / db-free.
**File:** `src/lib/tagging/abc.ts`

---

### abcStrategy: TagStrategy
- `tagOnAdd(ctx, subject)` — returns the lowest free letter for the subject's WH class, or `null` for non-wormhole systems or the Home system. Taggable classes are the `Cn` labels from `deriveSecurityLabel` (wormhole space); k-space (`H`/`L`/`0.0`), Abyssal (`A`), and Pochven (`P`) are left untagged. The designated Home system (`ctx.homeMapSystemId`) is also always skipped. Each class has its own independent A, B, C… sequence; the lowest free ordinal is always chosen, so deleting a tagged system reclaims its letter.
- `tagOnConnect()` — always `null` (ABC is topology-independent).
- `availableTags(ctx)` — `{ scheme: 'abc', perClass }` listing the next 3 free letters for C1–C6 plus any other taggable class present on the map.

Letters use bijective base-26 (A…Z, AA, AB…) so a class with >26 holes keeps assigning. `letterForIndex`, `indexForLetter`, and `isTaggableClass` are **exported** (reused below); `lowestFreeLetters` stays internal.

### homeStaticExemptionChanges(ctx: TagContext): { mapSystemId: bigint; tag: string | null }[]
Pure core of the ABC home-static exemption. When `ctx.exemptHomeStatic` is on and a Home is set, the non-Home endpoints of static connections (`TagEdge.isStatic`) touching Home are the **exempt set**: they get `tag: null` (letter freed). Every other taggable system that is untagged is filled with the lowest free letter for its class (used-letter sets exclude the exempt systems, since their tags are about to clear). The Home system itself is always skipped — it is never auto-tagged or auto-cleared by this function. Returns `[]` for non-ABC snapshots. Self-healing — converges from any trigger (toggle, static unmarked/deleted, Home moved). The db-aware wrapper is `reconcileHomeStaticExemption` (`service.ts`); the event-emitting wrapper is `applyHomeStaticExemption` (`exemption.ts`).
