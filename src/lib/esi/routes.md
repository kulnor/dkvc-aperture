## routes.ts

**Purpose:** Resolve an OpenAPI `operationId` to its HTTP method, version-prefixed path template, and param names from `src/lib/esi/openapi.json` (server-only, memoized).
**File:** `src/lib/esi/routes.ts`

The single source of truth is the checked-in OpenAPI spec, imported statically (not read from disk) so it is bundled into both the Next-compiled server chunks and the tsx-run job process — no working-directory or docs/ asset dependency. The resolver indexes it rather than duplicating method/path data, so ESI route drift surfaces as a thrown error here.

---

### resolveRoute(operationId: string): ResolvedRoute
Looks up the operation in the memoized index. Builds the index lazily on first call from the statically-imported `./openapi.json`, typed via `openapi-types` `OpenAPIV3.Document`. Only `get`/`post` operations are indexed; `$ref` parameter entries are excluded via an `isParameterObject` type guard.

**Returns:** `{ method, path, pathParams, queryParams }`.
**Throws:** if the `operationId` is absent from the spec (the opKey test guards the known set).

### __resetRouteIndexForTest(): void
Drops the memoized index so a fresh parse can be observed in tests.

### ResolvedRoute
- `method: 'get' | 'post'`
- `path: string` — version-prefixed template with `{param}` placeholders.
- `pathParams: string[]` — `{…}` path param names, template order.
- `queryParams: string[]` — accepted query-string param names.
