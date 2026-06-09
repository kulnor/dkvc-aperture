## realtime-delivery.test.tsx

**Purpose:** Proves the `RealtimeProvider` / `useRealtimeEvents` listener registry delivers every inbound envelope exactly once — closing the same-tick burst-coalescing gap that the old single-slot `lastEvent` state had.
**File:** `tests/unit/realtime-delivery.test.tsx`

### Setup
- Stubs `globalThis.SharedWorker` with a `FakeSharedWorker` whose `port` (a `FakePort`) is captured in a module-level `lastPort`. The provider sets `port.onmessage` and calls `port.start()`; the test drives delivery by invoking `port.onmessage({ data: { type: 'message', envelope: { task, load } } })` directly.
- Renders with `react-dom/client` `createRoot` + React's `act` (sets `IS_REACT_ACT_ENVIRONMENT`) so mount effects (provider boots the worker, probe registers its listener) flush. No `@testing-library/react` dependency.
- A `Probe` component calls `useRealtimeEvents` and pushes each envelope's `load.n` into a `received[]` array.

### Cases
- **delivers every envelope in a same-tick burst, in order** — fires N=5 frames synchronously inside one `act()` (no await between, so React cannot flush between deliveries) and asserts `received === [0,1,2,3,4]`. The old `useState(lastEvent)` implementation would coalesce these to a single value; the listener registry delivers all N.
- **stops delivering after the consumer unmounts** — fires one frame with the Probe mounted, re-renders without the Probe, fires a second frame, and asserts only the first was received (the `useRealtimeEvents` effect cleanup tore the listener down).

### Depends On
- `@/lib/realtime/useRealtime` (`RealtimeProvider`, `useRealtimeEvents`), `@/lib/realtime/protocol` (`Envelope` type).
