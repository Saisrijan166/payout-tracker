import { describeSpike, detectViewSpike } from '../../src/domain/spike';

const THRESHOLDS = { minGain: 10_000, viewsPerMinute: 1_000 };
const NOW = new Date('2026-10-13T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('detectViewSpike', () => {
  it.each([
    ['+15,000 in 5 min (3,000/min)', 0, 15_000, 5, true],
    ['+15,000 over 2 h (125/min)', 0, 15_000, 120, false],
    ['+5,000 in 10 s: rate is high but the gain is below the minimum', 0, 5_000, 10 / 60, false],
    ['+20,000 in 10 s: elapsed time is floored at 1 minute', 0, 20_000, 10 / 60, true],
    ['exactly on both thresholds: +10,000 in 10 min', 0, 10_000, 10, true],
    ['just under the rate: +10,000 in 10 min 1 s', 0, 10_000, 10 + 1 / 60, false],
    ['measured from the previous reading, not from zero', 50_000, 58_000, 1, false],
  ])('%s -> spike: %s', (_label, previousViews, newViews, elapsed, expected) => {
    const check = detectViewSpike(
      { views: previousViews, at: minutesAgo(elapsed) },
      newViews,
      NOW,
      THRESHOLDS,
    );
    expect(check.isSpike).toBe(expected);
  });

  it('reports the gain and rate it measured', () => {
    expect(detectViewSpike({ views: 1_000, at: minutesAgo(5) }, 16_000, NOW, THRESHOLDS)).toEqual({
      isSpike: true,
      gained: 15_000,
      elapsedMinutes: 5,
      viewsPerMinute: 3_000,
    });
  });

  it('never reports a negative gain or a negative elapsed time', () => {
    const check = detectViewSpike({ views: 10, at: minutesAgo(-5) }, 5, NOW, THRESHOLDS);
    expect(check).toMatchObject({ isSpike: false, gained: 0, elapsedMinutes: 0 });
  });
});

describe('describeSpike', () => {
  it.each([
    [
      { gained: 15_000, elapsedMinutes: 5, viewsPerMinute: 3_000 },
      '+15,000 views in 5 min (3,000/min)',
    ],
    [
      { gained: 20_000, elapsedMinutes: 0.2, viewsPerMinute: 20_000 },
      '+20,000 views in under a minute (20,000/min)',
    ],
    [
      { gained: 1_50_000, elapsedMinutes: 90, viewsPerMinute: 1_666.6 },
      '+1,50,000 views in 1.5 h (1,667/min)',
    ],
  ])('%o -> %s', (check, expected) => {
    expect(describeSpike({ isSpike: true, ...check })).toBe(expected);
  });
});
