export interface SpikeThresholds {
  /** Minimum views gained since the previous reading before a jump can count as a spike. */
  minGain: number;
  /** Rate (views per minute) at or above which that gain counts as a spike. */
  viewsPerMinute: number;
}

export interface PreviousReading {
  views: number;
  at: Date;
}

export interface SpikeCheck {
  isSpike: boolean;
  gained: number;
  elapsedMinutes: number;
  viewsPerMinute: number;
}

/**
 * A spike is a large jump at a high rate since the previous reading:
 * gained >= minGain AND gained / minutes >= viewsPerMinute.
 * Elapsed time is floored at one minute, so near-simultaneous readings do not
 * produce an absurd rate from a tiny denominator.
 */
export function detectViewSpike(
  previous: PreviousReading,
  newViews: number,
  now: Date,
  thresholds: SpikeThresholds,
): SpikeCheck {
  const gained = Math.max(0, newViews - previous.views);
  const elapsedMinutes = Math.max(0, (now.getTime() - previous.at.getTime()) / 60_000);
  const viewsPerMinute = gained / Math.max(elapsedMinutes, 1);
  return {
    isSpike: gained >= thresholds.minGain && viewsPerMinute >= thresholds.viewsPerMinute,
    gained,
    elapsedMinutes,
    viewsPerMinute,
  };
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

/** Human-readable reason stored on a flagged submission, e.g. "+15,000 views in 5 min (3,000/min)". */
export function describeSpike(check: SpikeCheck): string {
  const gained = check.gained.toLocaleString('en-IN');
  const rate = Math.round(check.viewsPerMinute).toLocaleString('en-IN');
  return `+${gained} views in ${formatDuration(check.elapsedMinutes)} (${rate}/min)`;
}
