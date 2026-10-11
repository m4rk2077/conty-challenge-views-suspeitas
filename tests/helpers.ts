import type { HourPoint } from '../src/schema.js';
export function hourly(values: readonly number[]): HourPoint[] {
  return values.map((views, index) => ({ timestamp: new Date(Date.UTC(2026, 5, 1) + index * 3_600_000).toISOString(), views }));
}
export const fill = (count: number, value: number) => Array<number>(count).fill(value);
export function viralValues(baseline = 100, amplitude = 30, duration = 8, onset = 16, noise = 0.1): number[] {
  return Array.from({ length: 96 }, (_, hour) => {
    const t = hour - onset;
    const level = t < 0 ? baseline : t < duration ? baseline * amplitude ** ((t + 1) / duration)
      : baseline + baseline * (amplitude - 1) * Math.exp(-(t - duration + 1) / 14);
    return Math.round(level * (1 + noise * Math.sin(hour * 1.7)));
  });
}
