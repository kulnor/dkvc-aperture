import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RealtimeProvider,
  useRealtimeEvents,
} from '@/lib/realtime/useRealtime';
import type { Envelope } from '@/lib/realtime/protocol';

// Fake SharedWorker port: the provider sets `onmessage` and calls `start()`;
// the test drives delivery by invoking `onmessage` directly. The most recently
// constructed port is captured so the test can fire frames at it.
class FakePort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  start = vi.fn();
  close = vi.fn();
}

let lastPort: FakePort | null = null;

class FakeSharedWorker {
  port: FakePort;
  constructor() {
    this.port = new FakePort();
    lastPort = this.port;
  }
}

function Probe({ onEnv }: { onEnv: (env: Envelope) => void }) {
  useRealtimeEvents(onEnv);
  return null;
}

function envelopeFrame(n: number) {
  // `envelopeSchema` only pins `{ task, load }`; `load` is `unknown`, so any
  // shape rides through — we tag each with `n` to assert delivery order.
  return { data: { type: 'message', envelope: { task: 'mapUpdate', load: { n } } } } as MessageEvent;
}

describe('realtime envelope delivery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    vi.stubGlobal('SharedWorker', FakeSharedWorker);
    lastPort = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('delivers every envelope in a same-tick burst, in order', () => {
    const received: number[] = [];
    act(() => {
      root.render(
        <RealtimeProvider>
          <Probe onEnv={(env) => received.push((env.load as { n: number }).n)} />
        </RealtimeProvider>,
      );
    });

    expect(lastPort).not.toBeNull();
    const port = lastPort!;
    expect(port.onmessage).toBeTypeOf('function');

    // Fire N frames synchronously within one act() — no await between them, so
    // React has no chance to flush between deliveries. The old single-slot
    // `lastEvent` state coalesced these to one; the listener registry delivers
    // all N.
    const N = 5;
    act(() => {
      for (let i = 0; i < N; i++) port.onmessage!(envelopeFrame(i));
    });

    expect(received).toEqual([0, 1, 2, 3, 4]);
  });

  it('stops delivering after the consumer unmounts', () => {
    const received: number[] = [];
    act(() => {
      root.render(
        <RealtimeProvider>
          <Probe onEnv={(env) => received.push((env.load as { n: number }).n)} />
        </RealtimeProvider>,
      );
    });
    const port = lastPort!;

    act(() => port.onmessage!(envelopeFrame(0)));
    // Re-render without the Probe — its listener must be torn down.
    act(() => root.render(<RealtimeProvider>{null}</RealtimeProvider>));
    act(() => port.onmessage!(envelopeFrame(1)));

    expect(received).toEqual([0]);
  });
});
