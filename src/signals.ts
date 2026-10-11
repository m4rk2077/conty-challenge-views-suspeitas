import type { HourPoint } from './schema.js';
import { RULES } from './rules.js';

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function extractSignals(series: readonly HourPoint[]) {
  const values = series.map(point => point.views);
  const total = values.reduce((sum, value) => sum + value, 0);
  const baseline = median(values.slice(0, RULES.baselineHours));
  const peak = Math.max(...values);
  const peakIndex = values.indexOf(peak);
  let peakEndIndex = peakIndex;
  while (peakEndIndex + 1 < values.length && values[peakEndIndex + 1] === peak) peakEndIndex++;
  // A plateau's terminal drop is not natural variation inside its peak.
  const tail = values.slice(peakEndIndex + 1, peakEndIndex + 1 + RULES.retentionHours);
  const completeTail = tail.length === RULES.retentionHours && peak > 0;
  const tailMean = completeTail ? mean(tail) : 0;
  const tailCv = completeTail && tailMean > 0
    ? Math.sqrt(mean(tail.map(value => (value - tailMean) ** 2))) / tailMean : null;
  let largestWindow = 0;
  let windowSum = 0;
  let maxRise = 1;
  let maxDrop = 0;
  let run = 0;
  let longestRun = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i]!;
    windowSum += current;
    if (i >= RULES.concentrationWindow) windowSum -= values[i - RULES.concentrationWindow]!;
    largestWindow = Math.max(largestWindow, windowSum);
    if (i > 0) {
      const prior = values[i - 1]!;
      maxRise = Math.max(maxRise, current / Math.max(1, prior));
      if (prior > 0) maxDrop = Math.max(maxDrop, (prior - current) / prior);
    }
    if (current >= Math.max(RULES.elevatedFloor, baseline * RULES.elevatedBaselineMultiple)) {
      run = i > 0 && current === values[i - 1] ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    } else run = 0;
  }
  return {
    sample_hours: values.length,
    total_views: total,
    baseline_first_8h: baseline,
    peak_views: peak,
    peak_hour_index: peakIndex,
    peak_end_hour_index: peakEndIndex,
    peak_to_baseline: peak / Math.max(1, baseline),
    max_hourly_increase_ratio: maxRise,
    max_hourly_drop_ratio: maxDrop,
    concentration_4h: total > 0 ? largestWindow / total : 0,
    post_peak_retention: completeTail ? tailMean / peak : null,
    post_peak_cv: tailCv,
    elevated_repeat_hours: longestRun
  };
}
export type Signals = ReturnType<typeof extractSignals>;
