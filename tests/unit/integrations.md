## integrations.test.ts

**Purpose:** Unit coverage for third-party clients, link helpers, and payload decoders.
**File:** `tests/unit/integrations.test.ts`

---

### Stage 13 decoders
Asserts representative ESI sov/FW, zKillboard, EVE-Scout, and GitHub payloads pass their Zod schemas. The sovereignty case also asserts the decoder flattens the nested 2026 `claim` (faction / alliance / unclaimed) shape back to the legacy flat owner row.

---

### Stage 13 link helpers
Asserts DOTLAN, EVEEYE, Anoik, zKillboard, and CCP image helper URLs are stable.

---

### Stage 13 integration clients
Mocks `fetch` to prove zKillboard mapping/rate-limit handling, EVE-Scout mapping/error envelopes, and GitHub changelog release mapping.
