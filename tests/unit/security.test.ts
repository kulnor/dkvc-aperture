import { describe, it, expect } from 'vitest';
import { deriveSecurityLabel, roundSecurity } from '@/lib/sde/security';

// region ids: Placid (k-space empire) and an example wormhole/abyssal/pochven region.
const PLACID = 10000048;
const POCHVEN = 10000070;
const WORMHOLE = 11000001;
const ABYSSAL = 12000001;

describe('roundSecurity', () => {
  it('rounds to one decimal place (round half up)', () => {
    expect(roundSecurity(0.439)).toBeCloseTo(0.4);
    expect(roundSecurity(0.45)).toBeCloseTo(0.5);
    expect(roundSecurity(0.94)).toBeCloseTo(0.9);
  });

  it('never floors a positive true sec to 0.0 — sub-0.05 rounds up to 0.1', () => {
    // Vestouve sits at ~0.04: lowsec in game, not nullsec.
    expect(roundSecurity(0.04)).toBeCloseTo(0.1);
    expect(roundSecurity(0.01)).toBeCloseTo(0.1);
    expect(roundSecurity(0.049)).toBeCloseTo(0.1);
  });

  it('keeps zero and negative securities as-is', () => {
    expect(roundSecurity(0)).toBe(0);
    expect(roundSecurity(-0.04)).toBeCloseTo(0);
    expect(roundSecurity(-0.5)).toBeCloseTo(-0.5);
  });
});

describe('deriveSecurityLabel', () => {
  it('classifies a positive sub-0.05 k-space system as lowsec, not nullsec', () => {
    expect(
      deriveSecurityLabel({ regionId: PLACID, wormholeClassId: 7, securityStatus: 0.04 }),
    ).toBe('L');
  });

  it('classifies k-space by rounded security', () => {
    expect(deriveSecurityLabel({ regionId: PLACID, wormholeClassId: 7, securityStatus: 0.5 })).toBe('H');
    expect(deriveSecurityLabel({ regionId: PLACID, wormholeClassId: 7, securityStatus: 0.2 })).toBe('L');
    expect(deriveSecurityLabel({ regionId: PLACID, wormholeClassId: 7, securityStatus: 0 })).toBe('0.0');
    expect(deriveSecurityLabel({ regionId: PLACID, wormholeClassId: 7, securityStatus: -0.3 })).toBe('0.0');
  });

  it('classifies special-space regions ahead of security status', () => {
    expect(deriveSecurityLabel({ regionId: ABYSSAL, wormholeClassId: null, securityStatus: null })).toBe('A');
    expect(deriveSecurityLabel({ regionId: POCHVEN, wormholeClassId: null, securityStatus: null })).toBe('P');
    expect(deriveSecurityLabel({ regionId: WORMHOLE, wormholeClassId: 3, securityStatus: null })).toBe('C3');
    expect(deriveSecurityLabel({ regionId: WORMHOLE, wormholeClassId: null, securityStatus: null })).toBe('C?');
  });
});
