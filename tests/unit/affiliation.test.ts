// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the ESI client before the helper under test imports it.
vi.mock('@/lib/esi/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/esi/client')>();
  return { ...actual, esiCall: vi.fn() };
});

import { esiCall } from '@/lib/esi/client';
import { fetchAffiliations } from '@/lib/esi/affiliation';

const mockedEsiCall = vi.mocked(esiCall);

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchAffiliations', () => {
  it('short-circuits with no ESI call on empty input', async () => {
    const result = await fetchAffiliations([]);
    expect(result.size).toBe(0);
    expect(mockedEsiCall).not.toHaveBeenCalled();
  });

  it('decodes corp/alliance into a map keyed by character id', async () => {
    mockedEsiCall.mockResolvedValueOnce([
      { character_id: 100, corporation_id: 2000, alliance_id: 3000 },
      { character_id: 200, corporation_id: 2001 }, // no alliance
    ] as never);

    const result = await fetchAffiliations([100n, 200n]);

    expect(mockedEsiCall).toHaveBeenCalledTimes(1);
    expect(mockedEsiCall).toHaveBeenCalledWith(
      'getCharacterAffiliation',
      expect.objectContaining({ body: [100, 200] }),
    );
    expect(result.get(100n)).toEqual({ corporationId: 2000n, allianceId: 3000n });
    expect(result.get(200n)).toEqual({ corporationId: 2001n, allianceId: null });
  });

  it('chunks ids to ESI\'s 1000-per-request limit', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => BigInt(i + 1));
    mockedEsiCall.mockImplementation(async (_op, opts) => {
      const body = (opts as { body: number[] }).body;
      return body.map((id) => ({ character_id: id, corporation_id: id + 100000 })) as never;
    });

    const result = await fetchAffiliations(ids);

    expect(mockedEsiCall).toHaveBeenCalledTimes(2); // 1000 + 500
    expect((mockedEsiCall.mock.calls[0]![1] as { body: number[] }).body).toHaveLength(1000);
    expect((mockedEsiCall.mock.calls[1]![1] as { body: number[] }).body).toHaveLength(500);
    expect(result.size).toBe(1500);
    expect(result.get(1n)).toEqual({ corporationId: 100001n, allianceId: null });
  });

  it('omits ids ESI does not return', async () => {
    mockedEsiCall.mockResolvedValueOnce([
      { character_id: 100, corporation_id: 2000 },
    ] as never);

    const result = await fetchAffiliations([100n, 200n]);
    expect(result.has(100n)).toBe(true);
    expect(result.has(200n)).toBe(false);
  });
});
