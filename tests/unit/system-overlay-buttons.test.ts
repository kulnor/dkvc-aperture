import { describe, expect, it } from 'vitest';
import { RALLY_UNDERGLOW, UNDERGLOW_PRESETS } from '@/components/map/underglowPresets';

// Pin the exact colours the overlay buttons use for their borders so a
// change to the underglow presets is visible here before it silently breaks
// the button styling.
describe('SystemOverlay button colours', () => {
  it('ping button border colour matches the ping underglow', () => {
    expect(UNDERGLOW_PRESETS.ping.color).toBe('#38bdf8');
  });

  it('rally button border colour matches the rally underglow', () => {
    expect(RALLY_UNDERGLOW.color).toBe('#9036e4');
  });
});
