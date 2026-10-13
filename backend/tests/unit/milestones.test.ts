import { MAX_MILESTONES, parseMilestoneLadder } from '../../src/domain/milestones';

const issuesFor = (...args: Parameters<typeof parseMilestoneLadder>): string[] => {
  const result = parseMilestoneLadder(...args);
  return result.ok ? [] : result.issues;
};

describe('parseMilestoneLadder', () => {
  it('sorts an unsorted ladder ascending by views', () => {
    const result = parseMilestoneLadder(
      [
        { views: 50_000, payout: 2_000 },
        { views: 10_000, payout: 500 },
        { views: 100_000, payout: 5_000 },
      ],
      10_000,
    );
    expect(result).toEqual({
      ok: true,
      ladder: [
        { views: 10_000, payout: 500 },
        { views: 50_000, payout: 2_000 },
        { views: 100_000, payout: 5_000 },
      ],
    });
  });

  it('copies milestones instead of returning the caller’s objects', () => {
    const input = [{ views: 10, payout: 1 }];
    const result = parseMilestoneLadder(input, 10);
    expect(result.ok && result.ladder[0]).not.toBe(input[0]);
  });

  it('rejects an empty ladder', () => {
    expect(issuesFor([], 1_000)).toEqual(['Add at least one milestone']);
  });

  it(`rejects more than ${MAX_MILESTONES} milestones`, () => {
    const ladder = Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => ({
      views: (i + 1) * 1_000,
      payout: (i + 1) * 100,
    }));
    expect(issuesFor(ladder, 1_000_000)).toEqual([`Use at most ${MAX_MILESTONES} milestones`]);
  });

  it.each([
    ['zero views', { views: 0, payout: 100 }, 'views must be a positive whole number'],
    ['negative views', { views: -10, payout: 100 }, 'views must be a positive whole number'],
    ['fractional views', { views: 10.5, payout: 100 }, 'views must be a positive whole number'],
    ['zero payout', { views: 10, payout: 0 }, 'payout must be a positive whole number'],
    ['fractional payout', { views: 10, payout: 99.5 }, 'payout must be a positive whole number'],
  ])('rejects %s', (_label, milestone, message) => {
    expect(issuesFor([milestone], 1_000)).toEqual([expect.stringContaining(message)]);
  });

  it('rejects duplicate view thresholds', () => {
    const issues = issuesFor(
      [
        { views: 10_000, payout: 500 },
        { views: 10_000, payout: 800 },
      ],
      5_000,
    );
    expect(issues).toEqual(['View threshold 10000 is used more than once']);
  });

  it('rejects payouts that do not increase with views', () => {
    const issues = issuesFor(
      [
        { views: 10_000, payout: 2_000 },
        { views: 50_000, payout: 2_000 },
        { views: 100_000, payout: 1_000 },
      ],
      10_000,
    );
    expect(issues).toEqual([
      'Payout at 50000 views must be higher than the payout at 10000 views',
      'Payout at 100000 views must be higher than the payout at 50000 views',
    ]);
  });

  it('rejects a top payout larger than the total budget', () => {
    expect(issuesFor([{ views: 10_000, payout: 5_000 }], 4_999)).toEqual([
      'Top payout (5000) cannot exceed the total budget (4999)',
    ]);
  });

  it('accepts a top payout equal to the total budget', () => {
    expect(parseMilestoneLadder([{ views: 10_000, payout: 5_000 }], 5_000).ok).toBe(true);
  });
});
